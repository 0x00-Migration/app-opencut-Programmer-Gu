import {
	PitchShifter,
	SimpleFilter,
	SoundTouch,
	WebAudioBufferSource,
} from "soundtouchjs";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { RetimeConfig } from "@/timeline";
import { getSourceTimeAtClipTime } from "./resolve";

const RATE_EPSILON = 1e-6;

function sampleLinear({
	channelData,
	position,
}: {
	channelData: Float32Array;
	position: number;
}): number {
	if (position <= 0) {
		return channelData[0] ?? 0;
	}
	const lower = Math.floor(position);
	const upper = Math.min(channelData.length - 1, lower + 1);
	if (lower >= channelData.length) {
		return 0;
	}
	const fraction = position - lower;
	return channelData[lower] * (1 - fraction) + channelData[upper] * fraction;
}

function buildResampledBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	targetSampleRate,
	retime,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	targetSampleRate: number;
	retime?: RetimeConfig;
}): AudioBuffer {
	const outputLength = Math.max(1, Math.ceil(clipDuration * targetSampleRate));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));
	const outputBuffer = audioContext.createBuffer(
		numChannels,
		outputLength,
		targetSampleRate,
	);

	for (let channel = 0; channel < numChannels; channel++) {
		const sourceData = sourceBuffer.getChannelData(
			Math.min(channel, sourceBuffer.numberOfChannels - 1),
		);
		const outputData = outputBuffer.getChannelData(channel);

		for (let i = 0; i < outputLength; i++) {
			const clipTime = i / targetSampleRate;
			const sourceTime =
				trimStart + getSourceTimeAtClipTime({ clipTime, retime });
			outputData[i] = sampleLinear({
				channelData: sourceData,
				position: sourceTime * sourceBuffer.sampleRate,
			});
		}
	}

	return outputBuffer;
}

async function buildPitchPreservedBuffer({
	sourceBuffer,
	trimStart,
	clipDuration,
	rate,
	targetSampleRate,
}: {
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	rate: number;
	targetSampleRate: number;
}): Promise<AudioBuffer> {
	const nativeSampleRate = sourceBuffer.sampleRate;
	const sourceDuration = clipDuration * rate;
	const startSample = Math.max(0, Math.floor(trimStart * nativeSampleRate));
	const numSourceSamples = Math.max(
		1,
		Math.ceil(sourceDuration * nativeSampleRate),
	);
	const available = Math.max(0, sourceBuffer.length - startSample);
	const actualSamples = Math.max(1, Math.min(numSourceSamples, available));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));

	// Resample to targetSampleRate first — soundtouchjs reads raw channel data
	// and does not respect the source buffer's native sample rate.
	const resampledLength = Math.max(
		1,
		Math.ceil(sourceDuration * targetSampleRate),
	);
	const resampleCtx = new OfflineAudioContext(
		numChannels,
		resampledLength,
		targetSampleRate,
	);
	const nativeBuffer = resampleCtx.createBuffer(
		numChannels,
		actualSamples,
		nativeSampleRate,
	);

	for (let ch = 0; ch < numChannels; ch++) {
		const src = sourceBuffer.getChannelData(
			Math.min(ch, sourceBuffer.numberOfChannels - 1),
		);
		nativeBuffer.copyToChannel(
			src.subarray(startSample, startSample + actualSamples),
			ch,
		);
	}

	const resampleSourceNode = resampleCtx.createBufferSource();
	resampleSourceNode.buffer = nativeBuffer;
	resampleSourceNode.connect(resampleCtx.destination);
	resampleSourceNode.start(0);
	const resampledBuffer = await resampleCtx.startRendering();

	const outputSamples = Math.max(
		1,
		Math.ceil(clipDuration * targetSampleRate),
	);
	const stretchCtx = new OfflineAudioContext(
		numChannels,
		outputSamples,
		targetSampleRate,
	);
	let shifter: PitchShifter;
	try {
		shifter = new PitchShifter(stretchCtx, resampledBuffer, 4096);
	} catch (error) {
		// Dopame migration: PitchShifter is built on ScriptProcessorNode, which the acde runtime does not have
		// (createScriptProcessor throws NotSupportedError). Stretch with soundtouch's offline API instead.
		if (!(error instanceof DOMException && error.name === "NotSupportedError")) throw error;
		return stretchWithoutScriptProcessor({
			context: stretchCtx,
			input: resampledBuffer,
			rate,
			outputSamples,
			numChannels,
		});
	}
	shifter.tempo = rate;
	shifter.pitch = 1;
	shifter.connect(stretchCtx.destination);
	return stretchCtx.startRendering();
}

// Dopame migration: the same SoundTouch time stretch, run directly on the samples. soundtouch holds back a few
// hundred milliseconds, so the input gets 0.5 s of silence to flush it (measured: with it, the first
// length / rate output frames are all signal at rates 0.5, 1.5 and 2), and the output is cut to the clip length.
function stretchWithoutScriptProcessor({
	context,
	input,
	rate,
	outputSamples,
	numChannels,
}: {
	context: BaseAudioContext;
	input: AudioBuffer;
	rate: number;
	outputSamples: number;
	numChannels: number;
}): AudioBuffer {
	const padding = Math.ceil(input.sampleRate * 0.5);
	const padded = context.createBuffer(2, input.length + padding, input.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		padded.copyToChannel(input.getChannelData(Math.min(ch, input.numberOfChannels - 1)), ch);
	}
	const soundTouch = new SoundTouch();
	soundTouch.tempo = rate;
	soundTouch.pitch = 1;
	const filter = new SimpleFilter(new WebAudioBufferSource(padded), soundTouch);

	const output = context.createBuffer(numChannels, outputSamples, input.sampleRate);
	const channels = Array.from({ length: numChannels }, (_, ch) => output.getChannelData(ch));
	const chunk = new Float32Array(4096 * 2);
	let written = 0;
	while (written < outputSamples) {
		const frames = filter.extract(chunk, 4096);
		if (frames <= 0) break;
		const take = Math.min(frames, outputSamples - written);
		for (let i = 0; i < take; i++) {
			channels[0][written + i] = chunk[i * 2];
			if (numChannels > 1) channels[1][written + i] = chunk[i * 2 + 1];
		}
		written += take;
	}
	return output;
}

export async function renderRetimedBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	retime,
	maintainPitch = false,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime?: RetimeConfig;
	maintainPitch?: boolean;
}): Promise<AudioBuffer> {
	const targetSampleRate = audioContext.sampleRate;
	const rate = clampRetimeRate({ rate: retime?.rate ?? 1 });
	const usePitchPreservation =
		shouldMaintainPitch({ rate, maintainPitch }) &&
		Math.abs(rate - 1) > RATE_EPSILON;

	if (usePitchPreservation) {
		return buildPitchPreservedBuffer({
			sourceBuffer,
			trimStart,
			clipDuration,
			rate,
			targetSampleRate,
		});
	}

	return buildResampledBuffer({
		audioContext,
		sourceBuffer,
		trimStart,
		clipDuration,
		targetSampleRate,
		retime,
	});
}
