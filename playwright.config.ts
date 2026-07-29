import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	workers: 2,
	fullyParallel: false,
	webServer: {
		command: 'pnpm build:web && pnpm preview',
		port: 4173,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	},
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}',
	projects: [
		{
			name: 'app',
			testIgnore: '**/pwa.e2e.{ts,js}'
		},
		{
			name: 'pwa',
			testMatch: '**/pwa.e2e.{ts,js}',
			workers: 1
		}
	]
});
