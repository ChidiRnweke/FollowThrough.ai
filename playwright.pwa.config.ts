import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm preview --port 4174',
		port: 4174,
		timeout: 120_000
	},
	use: { baseURL: 'http://localhost:4174' },
	testMatch: '**/pwa.e2e.ts'
});
