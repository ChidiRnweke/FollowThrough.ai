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
				// Entries-aware groups append Kit's entry names (`nodes/0`, `entries/pages/…`) to
				// the chunk name. Kit derives each CSS asset path from that name, so the slashes
				// nest the stylesheet in folders. Its relative `url(./font.woff2)` then misses the
				// flat assets folder. Kit owns `assetFileNames`, so flatten the name here instead.
				// Only group names carry `~`; Kit's own entry names must keep their paths.
				sanitizeFileName: (name) => (name.includes('~') ? name.replaceAll('/', '_') : name),
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
			// Kit's form-origin check runs before `handle` and cannot exempt the OAuth token
			// endpoint, which clients post to without an Origin. `hooks.server.ts` applies the
			// same rule with that one exemption (`src/lib/server/infrastructure/http/request-origin.ts`).
			csrf: { trustedOrigins: ['*'] },
			// Reported, not enforced: a browser logs each load outside this policy to the console
			// and blocks nothing. `report-to` names a group with no `Reporting-Endpoints` header,
			// which Kit requires of a report-only policy; no report leaves the browser yet. `auto`
			// gives Kit's inline scripts a nonce (or a hash on the prerendered offline page).
			// `hooks.server.ts` enforces `frame-ancestors 'none'` on every response separately.
			csp: {
				mode: 'auto',
				reportOnly: {
					'default-src': ['self'],
					// Harper proofreading compiles its WebAssembly checker in the browser.
					'script-src': ['self', 'wasm-unsafe-eval'],
					// Svelte transitions and Mermaid's SVG write inline styles.
					'style-src': ['self', 'unsafe-inline'],
					// A remote image in Markdown still loads once the reader asks; attachments
					// redirect to presigned object-storage URLs.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'font-src': ['self', 'data:'],
					// Uploads and downloads go straight to the object store's presigned URLs, and
					// its origin is runtime configuration (`S3_ENDPOINT`) this build-time policy
					// cannot read. Narrowing it needs the policy built per request.
					'connect-src': ['self', 'https:'],
					'media-src': ['self', 'blob:', 'https:'],
					// draw.io (https://embed.diagrams.net), the PDF export preview (blob:), and the
					// iframes a note embeds, which may name any https address.
					'frame-src': ['https:', 'blob:'],
					// The service worker, and Harper's worker, which starts from a blob URL.
					'worker-src': ['self', 'blob:'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'report-to': ['csp-report-only']
				}
			},
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
