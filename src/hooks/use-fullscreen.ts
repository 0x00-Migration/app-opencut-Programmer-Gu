import { useCallback, useEffect, useState } from "react";
import { isAcdeRuntime } from "@/utils/acde-runtime";

type AcdeWindow = {
	state: "normal" | "minimized" | "filled" | "fullscreen";
	requestState: (state: "normal" | "fullscreen") => void;
	on: (event: "state", handler: (e: { state: string }) => void) => unknown;
};

// Dopame migration: the acde runtime does not support element.requestFullscreen() (it rejects with
// NotSupportedError); full screen is a state of the whole window there, set through acde:window. The preview
// container is made to fill the window with CSS, so the result looks as it does in browsers. The import goes
// through Function so the bundler leaves the acde: specifier to the runtime. See MIGRATION.md.
let acdeWindow: Promise<AcdeWindow | null> | null = null;
function loadAcdeWindow(): Promise<AcdeWindow | null> {
	acdeWindow ??= (new Function("s", "return import(s)") as (s: string) => Promise<{ window: AcdeWindow }>)(
		"acde:window",
	).then(
		(m) => m.window,
		() => null,
	);
	return acdeWindow;
}

const ACDE_FULLSCREEN_STYLE =
	"position:fixed;inset:0;z-index:2147483000;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border-radius:0;background:#000";

export function useFullscreen({
	containerRef,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	const acde = isAcdeRuntime();

	useEffect(() => {
		if (acde) return;
		const handleChange = () => {
			setIsFullscreen(document.fullscreenElement !== null);
		};
		document.addEventListener("fullscreenchange", handleChange);
		return () => {
			document.removeEventListener("fullscreenchange", handleChange);
		};
	}, [acde]);

	const setAcdeFullscreen = useCallback(
		(next: boolean) => {
			const container = containerRef.current;
			if (!container) return;
			if (next) {
				container.dataset.dopameStyle = container.getAttribute("style") ?? "";
				container.setAttribute("style", `${container.dataset.dopameStyle};${ACDE_FULLSCREEN_STYLE}`);
			} else {
				container.setAttribute("style", container.dataset.dopameStyle ?? "");
				delete container.dataset.dopameStyle;
			}
			setIsFullscreen(next);
			void loadAcdeWindow().then((win) => win?.requestState(next ? "fullscreen" : "normal"));
		},
		[containerRef],
	);

	// Browsers leave full screen on Escape; do the same, and follow the window when the system leaves full screen.
	useEffect(() => {
		if (!acde || !isFullscreen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setAcdeFullscreen(false);
		};
		document.addEventListener("keydown", onKey);
		let cancelled = false;
		void loadAcdeWindow().then((win) =>
			win?.on("state", ({ state }) => {
				if (!cancelled && state === "normal") setAcdeFullscreen(false);
			}),
		);
		return () => {
			cancelled = true;
			document.removeEventListener("keydown", onKey);
		};
	}, [acde, isFullscreen, setAcdeFullscreen]);

	const toggleFullscreen = useCallback(() => {
		if (!containerRef.current) return;
		if (acde) {
			setAcdeFullscreen(!isFullscreen);
			return;
		}
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			containerRef.current.requestFullscreen();
		}
	}, [acde, containerRef, isFullscreen, setAcdeFullscreen]);

	return { isFullscreen, toggleFullscreen };
}
