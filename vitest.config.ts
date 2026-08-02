import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const lib = fileURLToPath(new URL('./src/lib', import.meta.url));
const common = {
	expect: { requireAssertions: true },
	pool: 'forks' as const
};
const svelteCompiler = {
	runes: ({ filename }: { filename: string }) =>
		filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
	experimental: { async: true }
};
const componentSvelteKit = async () =>
	(
		await sveltekit({
			compilerOptions: svelteCompiler,
			outDir: '.svelte-kit-browser',
			files: {
				hooks: { server: 'src/lib/testing/browser-no-hooks' },
				routes: 'src/lib/testing/browser-no-routes'
			},
			experimental: { remoteFunctions: true, handleRenderingErrors: true }
		})
	).map((plugin) =>
		plugin.name === 'vite-plugin-sveltekit-compile'
			? { ...plugin, configureServer: undefined, configurePreviewServer: undefined }
			: plugin
	);

export default defineConfig({
	resolve: {
		alias: {
			$lib: lib
		}
	},
	test: {
		projects: [
			{
				plugins: [
					sveltekit({
						compilerOptions: svelteCompiler,
						experimental: { remoteFunctions: true, handleRenderingErrors: true }
					})
				],
				resolve: { alias: { $lib: lib } },
				test: {
					...common,
					name: 'node-fast',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/**/*.isolated.spec.{js,ts}',
						'src/**/*.contract.spec.ts'
					],
					isolate: false,
					maxWorkers: 1,
					sequence: { groupOrder: 0 }
				}
			},
			{
				plugins: [componentSvelteKit()],
				test: {
					...common,
					name: 'browser-focused',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: [
						'src/lib/components/ui/ref-contracts.svelte.spec.ts',
						'src/lib/components/edra/commands/InlineSuggestion.svelte.spec.ts',
						'src/lib/components/diagrams/drawio-embed.svelte.spec.ts',
						'src/lib/components/notes/export/export-slider.svelte.spec.ts',
						'src/lib/components/notes/note-conflict-dialog.svelte.spec.ts',
						'src/lib/components/shared/safe-svg-preview.svelte.spec.ts',
						'src/lib/components/layout/error-boundary.svelte.spec.ts',
						'src/lib/client/notes/sync/indexeddb-note-sync-repository.svelte.spec.ts'
					],
					isolate: true,
					maxWorkers: 1,
					sequence: { groupOrder: 2 }
				}
			},
			{
				plugins: [componentSvelteKit()],
				test: {
					...common,
					name: 'browser-full',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					isolate: true,
					maxWorkers: 1
				}
			},
			{
				resolve: { alias: { $lib: lib } },
				test: {
					...common,
					name: 'contracts',
					environment: 'node',
					include: ['tests/integration/**/*.contract.spec.ts'],
					globalSetup: ['./src/lib/server/db/contract-global-setup.ts'],
					fileParallelism: false,
					maxWorkers: 1
				}
			},
			{
				resolve: { alias: { $lib: lib } },
				test: {
					...common,
					name: 'evals',
					environment: 'node',
					include: ['src/evals/**/*.eval.ts'],
					fileParallelism: false,
					maxWorkers: 1,
					testTimeout: 180_000,
					hookTimeout: 180_000,
					retry: 0
				}
			}
		]
	}
});
