import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

// A component-only server: the production auth/hooks/routes are never changed.
export default defineConfig({
	server: { fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
	plugins: [
		tailwindcss(),
		sveltekit({
			outDir: '.svelte-kit-browser',
			files: {
				hooks: { server: 'src/lib/testing/browser-no-hooks' },
				routes: 'tests/fixtures/surface-routes'
			},
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true, handleRenderingErrors: true }
		})
	]
});
