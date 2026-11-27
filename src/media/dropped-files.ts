// Dopame migration: the acde runtime puts only files of 64 MiB or less into dataTransfer.files; a bigger dropped
// file (most video clips) is reachable only through items[i].getAsFileSystemHandle(), so dropping a real video
// into OpenCut did nothing. Collect every dropped file from the items when dataTransfer.files is short. The item
// handles must be requested during the drop event (items stop working after it), so they are taken first and
// awaited afterwards. Browsers, whose dataTransfer.files is complete, take the first branch. See MIGRATION.md.

type HandleItem = DataTransferItem & {
	getAsFileSystemHandle?: () => Promise<{ kind: string; getFile?: () => Promise<File> } | null>;
};

export function hasDroppedFiles(dataTransfer: DataTransfer | null): boolean {
	if (!dataTransfer) return false;
	if (dataTransfer.files.length > 0) return true;
	return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

export function getDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
	const files = Array.from(dataTransfer.files);
	const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "file") as HandleItem[];
	if (files.length >= items.length) return Promise.resolve(files);

	const pending = items.map((item) => item.getAsFile() ?? item.getAsFileSystemHandle?.() ?? null);
	return (async () => {
		const result: File[] = [];
		for (const entry of pending) {
			const value = await entry;
			if (value instanceof File) result.push(value);
			else if (value && value.kind === "file" && value.getFile) result.push(await value.getFile());
		}
		return result;
	})();
}
