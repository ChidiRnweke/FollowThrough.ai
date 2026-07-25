import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			expect: {
				requireAssertions: true
			},

			maxWorkers: 4,

			projects: [
				{
					extends: true,
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [
								{
									browser: 'chromium',
									headless: true
								}
							]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},
				{
					extends: true,
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.contract.spec.ts']
					}
				},
				{
					extends: true,
					test: {
						name: 'contracts',
						environment: 'node',
						include: ['src/lib/server/**/*.contract.spec.ts'],
						fileParallelism: false
					}
				},
				{
					extends: true,
					test: {
						name: 'evals',
						environment: 'node',
						include: ['src/evals/**/*.eval.ts'],
						globalSetup: ['./src/evals/lab/global-setup.ts'],
						fileParallelism: false,
						testTimeout: 180_000,
						hookTimeout: 180_000,
						retry: 0
					}
				}
			]
		}
	})
);
