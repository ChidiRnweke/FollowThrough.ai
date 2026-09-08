import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/surface-text',
	testMatch: '**/*.e2e.ts',
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:5174',
		contextOptions: { reducedMotion: 'reduce' },
		viewport: { width: 1440, height: 900 }
	},
	webServer: {
		command:
			'pnpm exec vite dev --config vite.surface-text.config.ts --host 127.0.0.1 --port 5174 --strictPort',
		url: 'http://127.0.0.1:5174',
		timeout: 120_000,
		reuseExistingServer: false
	}
});
