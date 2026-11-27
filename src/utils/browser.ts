import { toast } from "sonner";
import { saveFile } from "@/utils/save-file";
export function downloadBlob({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): void {
	// Dopame migration: saveFile uses the save picker in the acde runtime, where <a download> saves nothing.
	void saveFile({ blob, filename }).catch((error) => {
		console.error(`Saving ${filename} failed`, error);
		toast.error(`Saving ${filename} failed`);
	});
}

export function findScrollParent({
	element,
}: {
	element: HTMLElement;
}): HTMLElement | null {
	let parent = element.parentElement;
	while (parent) {
		const { overflow, overflowX } = window.getComputedStyle(parent);
		if (/auto|scroll/.test(overflow + overflowX)) return parent;
		parent = parent.parentElement;
	}
	return null;
}

export function isTypableDOMElement({
	element,
}: {
	element: HTMLElement;
}): boolean {
	if (element.isContentEditable) return true;

	if (element.tagName === "INPUT") {
		return !(element as HTMLInputElement).disabled;
	}

	if (element.tagName === "TEXTAREA") {
		return !(element as HTMLTextAreaElement).disabled;
	}

	return false;
}
