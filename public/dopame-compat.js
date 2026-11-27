// Dopame migration: compatibility shims for the acde runtime, loaded first in <head> (src/app/layout.tsx).
// Each block names the runtime behaviour it works around; see MIGRATION.md. Outside the acde runtime only
// feature-detected polyfills apply, so browsers keep their own behaviour.
(function () {
	"use strict";

	// WebAssembly.instantiateStreaming / compileStreaming are missing in the acde runtime, and Turbopack loads
	// opencut-wasm with instantiateStreaming and no fallback, so the editor crashed on load.
	if (typeof WebAssembly !== "undefined") {
		if (!WebAssembly.instantiateStreaming) {
			WebAssembly.instantiateStreaming = async function (response, imports) {
				const bytes = await (await response).arrayBuffer();
				return WebAssembly.instantiate(bytes, imports);
			};
		}
		if (!WebAssembly.compileStreaming) {
			WebAssembly.compileStreaming = async function (response) {
				return WebAssembly.compile(await (await response).arrayBuffer());
			};
		}
	}

	const isAcde = / acde\//.test(navigator.userAgent);

	// GPUQueue.copyExternalImageToTexture in the acde runtime writes RGBA bytes into a bgra8unorm texture without
	// converting them (the spec converts to the destination format). opencut-wasm uses bgra8unorm on WebGPU, so
	// every uploaded image, text and video frame showed red and blue swapped, in the preview and in exports.
	// For bgra8unorm destinations, read the source's pixels, swap R and B, and write the bytes ourselves; this is
	// correct whether or not the runtime converts, so it does not need to detect the bug.
	if (isAcde && typeof GPUQueue !== "undefined" && GPUQueue.prototype.copyExternalImageToTexture) {
		const copy = GPUQueue.prototype.copyExternalImageToTexture;
		const scratch = { canvas: null, context: null };
		const extent = (size) =>
			Array.isArray(size) || size[Symbol.iterator]
				? [size[0], size[1] ?? 1]
				: [size.width, size.height ?? 1];
		const origin2d = (o) => (!o ? [0, 0] : Array.isArray(o) ? [o[0] ?? 0, o[1] ?? 0] : [o.x ?? 0, o.y ?? 0]);
		const pixels = (source, x, y, width, height) => {
			if (typeof ImageData !== "undefined" && source instanceof ImageData) {
				if (x === 0 && y === 0 && source.width === width && source.height === height) return source.data;
			}
			// An OffscreenCanvas or <canvas> that already has a 2D context can be read directly.
			if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
				const own = source.getContext("2d");
				if (own) return own.getImageData(x, y, width, height).data;
			}
			if (!scratch.canvas || scratch.canvas.width !== width || scratch.canvas.height !== height) {
				scratch.canvas = new OffscreenCanvas(width, height);
				scratch.context = scratch.canvas.getContext("2d", { willReadFrequently: true });
			}
			const context = scratch.context;
			context.clearRect(0, 0, width, height);
			if (source instanceof ImageData) context.putImageData(source, -x, -y);
			else context.drawImage(source, -x, -y);
			return context.getImageData(0, 0, width, height).data;
		};
		GPUQueue.prototype.copyExternalImageToTexture = function (source, destination, size) {
			const texture = destination && destination.texture;
			if (!texture || texture.format !== "bgra8unorm" || source.flipY || destination.premultipliedAlpha) {
				return copy.call(this, source, destination, size);
			}
			const [width, height] = extent(size);
			const [x, y] = origin2d(source.origin);
			const rgba = pixels(source.source, x, y, width, height);
			const words = new Uint32Array(rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + width * height * 4));
			// Little-endian RGBA word 0xAABBGGRR becomes BGRA 0xAARRGGBB.
			for (let i = 0; i < words.length; i++) {
				const v = words[i];
				words[i] = (v & 0xff00ff00) | ((v & 0xff) << 16) | ((v >>> 16) & 0xff);
			}
			this.writeTexture(
				{ texture, mipLevel: destination.mipLevel ?? 0, origin: destination.origin ?? [0, 0, 0] },
				words,
				{ bytesPerRow: width * 4, rowsPerImage: height },
				[width, height, 1],
			);
		};
	}
})();
