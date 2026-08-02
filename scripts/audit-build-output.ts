import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/**
 * Fails the build when an application-owned client chunk exceeds the Vite
 * warning threshold (500 kB default), while treating the known Mermaid vendor
 * bundle as an accepted cost of static mermaid imports.
 *
 * The old Mermaid loader injected the browser distribution as a script-tag asset
 * (`?url`), keeping it out of the chunk graph entirely. A normal static import
 * (mermaid-rendering.ts) bundles Mermaid's grammars into the graph; that chunk
 * is unavoidably large and carries no application code. Every other oversized
 * chunk is a regression and fails here.
 */

const THRESHOLD_BYTES = 500 * 1024;

const clientDir = resolve(root, '.svelte-kit/output/client/_app/immutable');
const containsApplicationCode = (file: string): boolean => {
	const source = readFileSync(file, 'utf8');
	// Mermaid's grammars and their language-server dependencies live under
	// node_modules; application modules are authored under src. A chunk that
	// only references node_modules is vendor-only.
	const hasNodeModules = /node_modules/.test(source);
	const hasApplicationPaths = /[\\/]src[\\/]/.test(source);
	return hasApplicationPaths || !hasNodeModules;
};

const collectChunks = (directory: string, files: string[] = []): string[] => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) collectChunks(path, files);
		else if (entry.name.endsWith('.js')) files.push(path);
	}
	return files;
};

const failures: string[] = [];
let oversizedVendorChunkCount = 0;
let largestApplicationChunk = 0;

for (const file of collectChunks(clientDir)) {
	const bytes = statSync(file).size;
	if (bytes <= THRESHOLD_BYTES) continue;
	if (!containsApplicationCode(file)) {
		oversizedVendorChunkCount += 1;
		continue;
	}
	largestApplicationChunk = Math.max(largestApplicationChunk, bytes);
	failures.push(`${file} is ${(bytes / 1024).toFixed(1)} kB, over the ${THRESHOLD_BYTES / 1024} kB limit`);
}

if (failures.length > 0) {
	process.stderr.write(`Client chunk audit: ${failures.length} application chunk(s) over the limit.\n`);
	process.stderr.write(`${failures.join('\n')}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Client chunk audit passed: no application chunk exceeds ${THRESHOLD_BYTES / 1024} kB ` +
			`(${oversizedVendorChunkCount} oversized vendor-only chunk(s) tolerated as the Mermaid bundle).\n`
	);
}
