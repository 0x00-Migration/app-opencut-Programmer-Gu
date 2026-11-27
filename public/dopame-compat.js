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
})();
