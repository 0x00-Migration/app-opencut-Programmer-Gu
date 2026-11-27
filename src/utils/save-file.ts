// Dopame migration: in the acde runtime `<a download>` saves nothing (the host answers 501), so exports and
// downloads were lost silently. There, save through the File System Access save picker instead, which the
// runtime supports; browsers keep the anchor download they always had. See MIGRATION.md.

import { isAcdeRuntime } from "@/utils/acde-runtime";

type SavePickerWindow = Window & {
	showSaveFilePicker?: (options?: {
		suggestedName?: string;
		types?: Array<{ description?: string; accept: Record<string, string[]> }>;
	}) => Promise<{
		createWritable: () => Promise<{
			write: (data: Blob) => Promise<void>;
			close: () => Promise<void>;
		}>;
	}>;
};

function anchorDownload({ blob, filename }: { blob: Blob; filename: string }) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

/** Saves `blob` as `filename`; resolves to false when the user cancelled the picker. */
export async function saveFile({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): Promise<boolean> {
	const picker = (window as SavePickerWindow).showSaveFilePicker;
	if (!isAcdeRuntime() || !picker) {
		anchorDownload({ blob, filename });
		return true;
	}
	const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
	try {
		const handle = await picker.call(window, {
			suggestedName: filename,
			types:
				blob.type && extension
					? [{ description: filename, accept: { [blob.type]: [extension] } }]
					: undefined,
		});
		const writable = await handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return true;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return false;
		throw error;
	}
}
