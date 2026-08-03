import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the worker sidecar entrypoint.
 *
 * Deliberately does not use the SvelteKit plugin: the worker serves no HTTP, and
 * nothing it imports reaches `$app/*`, `$env/*`, or a `.svelte` file — so a plain
 * SSR build with the one alias Kit would otherwise provide is enough. If this
 * build ever fails to resolve `$app/...`, that is a real finding rather than a
 * build problem: something server-side has picked up a dependency on the client
 * runtime, and the import belongs on the other side of the boundary.
 *
 * Dependencies stay external and resolve against the same `node_modules` the web
 * process uses.
 */
export default defineConfig({
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	build: {
		ssr: true,
		outDir: 'build-worker',
		emptyOutDir: true,
		target: 'node22',
		rollupOptions: {
			input: {
				worker: 'src/worker.ts',
				// Deploy-time seeder for the tool_embeddings table; runs next to migrations.
				'seed-tool-embeddings': 'src/seed-tool-embeddings.ts'
			},
			output: { entryFileNames: '[name].js' }
		}
	}
});
