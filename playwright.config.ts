import { defineConfig } from '@playwright/test';

export const testEnv = {
	CONFIG_SOURCE: 'env',
	// Auth stays enabled: the dev server hydrates the developer's real Authentik
	// values from .env. Playwright gets in via a cached session token minted by
	// the global setup (tests/auth.setup.ts), so no Authentik interaction happens.
	MISTRAL_API_KEY: 'playwright-not-used',
	OPENROUTER_API_KEY: 'playwright-not-used',
	OPENROUTER_BASE_URL: 'http://127.0.0.1:9'
};

// The e2e suite reuses the developer's own dev server on 5173 when it is
// running (reuseExistingServer below), so auth is enabled and hydrated from
// their real config. When nothing is listening, Playwright auto-starts the
// dev:e2e fallback on the same port.
export const appBaseURL = 'http://127.0.0.1:5173';

export default defineConfig({
	globalSetup: './tests/auth.setup.ts',
	testDir: './tests',
	workers: 1,
	fullyParallel: false,
	testMatch: '**/*.e2e.{ts,js}',
	testIgnore: '**/pwa.e2e.{ts,js}',
	use: { baseURL: appBaseURL, storageState: 'tests/.auth/state.json' },
	webServer: {
		command: 'pnpm dev:e2e',
		env: testEnv,
		url: appBaseURL,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	},
	projects: [{ name: 'app' }]
});
