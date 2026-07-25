import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv, type Plugin } from 'vite';
import { hydrateEnvironment, mergePlatformEnvironment } from './src/lib/server/secrets';

const managedConfiguration = (): Plugin => ({
	name: 'followthrough-managed-configuration',
	enforce: 'pre',
	apply: 'serve',
	async config(_config, { mode, isPreview }) {
		if (isPreview || process.env.npm_lifecycle_event !== 'dev') return;
		mergePlatformEnvironment(process.env, loadEnv(mode, process.cwd(), ''));
		await hydrateEnvironment();
		await import('./scripts/otel-instrumentation.js');
	}
});

export default defineConfig({
	plugins: [
		managedConfiguration(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true, handleRenderingErrors: true },
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		maxWorkers: 4,
		minWorkers: 1,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.contract.spec.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'contracts',
					environment: 'node',
					include: ['src/lib/server/**/*.contract.spec.ts'],
					fileParallelism: false
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'evals',
					environment: 'node',
					include: ['src/evals/**/*.eval.ts'],
					globalSetup: ['./src/evals/lab/global-setup.ts'],
					// One shared Postgres container per run; cases isolate by actor instead.
					fileParallelism: false,
					// A case is a real agent turn against a real model.
					testTimeout: 180_000,
					hookTimeout: 180_000,
					retry: 0
				}
			}
		]
	}
});
