declare module "soundtouchjs" {
	export class PitchShifter {
		constructor(
			context: BaseAudioContext,
			buffer: AudioBuffer,
			bufferSize: number,
			onEnd?: () => void,
		);
		tempo: number;
		pitch: number;
		connect(destination: AudioNode): void;
		off(): void;
	}

	// Used by retime/audio-stretch.ts where ScriptProcessorNode is missing (the acde runtime).
	export class SoundTouch {
		tempo: number;
		pitch: number;
	}
	export class WebAudioBufferSource {
		constructor(buffer: AudioBuffer);
	}
	export class SimpleFilter {
		constructor(source: WebAudioBufferSource, pipe: SoundTouch);
		/** Fills `target` with interleaved stereo frames; returns how many frames it wrote. */
		extract(target: Float32Array, numFrames: number): number;
	}
}
