// Dopame migration: copy the onnxruntime-web files transformers.js loads at run time into public/ort/, so the app
// serves them itself. transformers.js fetches them from cdn.jsdelivr.net by default, and the acde runtime does not
// import ES modules from other hosts ("is not a local file"), which made auto captions fail. Runs as postinstall;
// public/ort/ is not committed. See MIGRATION.md and src/services/transcription/worker.ts.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@huggingface", "transformers", "dist");
const to = join(root, "public", "ort");
const files = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];

if (!existsSync(from)) {
	console.warn(`copy-ort-assets: ${from} is missing; auto captions will not work on the acde runtime`);
	process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(join(from, file), join(to, file));
console.log(`copy-ort-assets: copied ${files.join(", ")} to public/ort/`);
