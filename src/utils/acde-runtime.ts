// Dopame migration: true inside the acde runtime (Dopame), whose user agent carries "acde/<version>". Used to
// switch on the workarounds listed in MIGRATION.md only there, so browsers keep upstream behaviour.
export function isAcdeRuntime(): boolean {
	return typeof navigator !== "undefined" && / acde\//.test(navigator.userAgent);
}
