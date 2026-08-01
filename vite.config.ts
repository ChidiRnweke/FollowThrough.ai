import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { hydrateEnvironment, mergePlatformEnvironment } from './src/lib/server/config';

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
			prerender: {
				entries: ['/offline']
			},
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: {
				remoteFunctions: true,
				handleRenderingErrors: true
			},
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	]
});
