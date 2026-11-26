import type { MediaAsset, MediaType } from "@/media/types";

export const SUPPORTS_AUDIO: readonly MediaType[] = ["audio", "video"];

export function mediaSupportsAudio({
	media,
}: {
	media: MediaAsset | null | undefined;
}): boolean {
	if (!media) return false;
	return SUPPORTS_AUDIO.includes(media.type);
}

// Dopame migration: files picked or dropped in the acde runtime have an empty `type` (Chrome derives it from the
// extension), which made every import fail with "Unsupported file type". Fall back to the extension.
const EXTENSION_TYPES: Record<string, string> = {
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
	svg: "image/svg+xml", bmp: "image/bmp",
	mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
	mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
	opus: "audio/opus", flac: "audio/flac",
};

export function mimeTypeOf(file: File): string {
	if (file.type) return file.type;
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	return EXTENSION_TYPES[extension] ?? "";
}

export const getMediaTypeFromFile = ({
	file,
}: {
	file: File;
}): MediaType | null => {
	const type = mimeTypeOf(file);

	if (type.startsWith("image/")) {
		return "image";
	}
	if (type.startsWith("video/")) {
		return "video";
	}
	if (type.startsWith("audio/")) {
		return "audio";
	}

	return null;
};
