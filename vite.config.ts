import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import type { Adapter } from '@sveltejs/kit';
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

/** Public, data-free SPA entry for offline navigation; private records live only in IndexedDB. */
const applicationAdapter = (): Adapter => {
	const node = adapter();
	return {
		...node,
		async adapt(builder) {
			await builder.generateFallback(`${builder.getClientDirectory()}/offline-shell.html`);
			await node.adapt(builder);
		}
	};
};

export default defineConfig({
	build: {
		rolldownOptions: {
			output: {
				strictExecutionOrder: true,
				// Keep production modules statically linked while allowing Rolldown to split
				// large shared graphs into cacheable chunks below Vite's warning boundary.
				codeSplitting: {
					groups: [
						{
							name: 'bounded',
							test: /[\\/](?:src|node_modules)[\\/]/,
							entriesAware: true,
							maxSize: 450 * 1024
						}
					]
				}
			}
		}
	},
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
			adapter: applicationAdapter(),
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
