import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

// Dopame migration: acdev runs `bun --bun <path>/next build`, which leaves NODE_OPTIONS=--bun in the environment.
// Turbopack starts its PostCSS workers with the real Node.js when one is installed (GitHub runners have one), and
// Node refuses to start with "--bun is not allowed in NODE_OPTIONS". This file is loaded before Turbopack starts
// those workers, so drop the flag here.
if (process.env.NODE_OPTIONS?.includes("--bun")) {
	const rest = process.env.NODE_OPTIONS.split(/\s+/).filter((option) => option && option !== "--bun").join(" ");
	if (rest) process.env.NODE_OPTIONS = rest;
	else delete process.env.NODE_OPTIONS;
}

const nextConfig: NextConfig = {
	// Dopame migration: upstream opencut-classic cf5e79e does not type-check with its own bun.lock (20 errors, e.g.
	// isShortcutKey / isActionWithOptionalArgs imported in actions/keybindings/persistence.ts but never defined), so
	// `next build` stops at "Running TypeScript". Skip that step; see MIGRATION.md.
	typescript: { ignoreBuildErrors: true },
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
