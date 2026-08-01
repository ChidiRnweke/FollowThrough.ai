import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	workers: 2,
	fullyParallel: false,
	webServer: {
		command: 'pnpm build:web && pnpm preview',
		env: {
			CONFIG_SOURCE: 'env',
			// A non-empty whitespace sentinel prevents dotenv from restoring the
			// developer's Authentik values; hydration trims it back to disabled.
			AUTHENTIK_CLIENT_ID: ' ',
			AUTHENTIK_CLIENT_SECRET: ' ',
			AUTHENTIK_DOMAIN: ' ',
			MISTRAL_API_KEY: 'playwright-not-used',
			OPENROUTER_API_KEY: 'playwright-not-used',
			OPENROUTER_BASE_URL: 'http://127.0.0.1:9'
		},
		port: 4173,
		timeout: 240_000,
		reuseExistingServer: false
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
