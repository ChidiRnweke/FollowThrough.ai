import { defineConfig } from '@playwright/test';
import { testEnv } from './playwright.config';

export default defineConfig({
	globalSetup: './tests/auth.setup.ts',
	testDir: './tests',
	workers: 1,
	fullyParallel: false,
	testMatch: ['**/pwa.e2e.{ts,js}', '**/workbench-account.e2e.ts'],
	use: {
		// The separate headless shell segfaults during context creation on CI.
		// Use regular Chromium's headless mode for the installed-app scenarios.
		channel: 'chromium',
		baseURL: 'http://127.0.0.1:4173',
		storageState: 'tests/.auth/state.json',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'pnpm build:web && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
		env: {
			...testEnv,
			// Seeded sessions must select the account in CI as well as on a configured developer machine.
			// No OAuth requests are made: tests/auth.setup.ts writes the session directly.
			AUTHENTIK_CLIENT_ID: 'playwright-session-tests',
			AUTHENTIK_CLIENT_SECRET: 'playwright-not-used',
			AUTHENTIK_DOMAIN: 'http://127.0.0.1:9',
			AUTHENTIK_CALLBACK_URL: 'http://127.0.0.1:4173/auth/callback'
		},
		stdout: 'pipe',
		url: 'http://127.0.0.1:4173',
		timeout: 240_000,
		reuseExistingServer: !process.env.CI
	},
	projects: [{ name: 'pwa' }]
});
