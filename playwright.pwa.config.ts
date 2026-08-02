import { defineConfig } from '@playwright/test';
import { testEnv } from './playwright.config';

export default defineConfig({
	globalSetup: './tests/auth.setup.ts',
	testDir: './tests',
	workers: 1,
	fullyParallel: false,
	testMatch: '**/pwa.e2e.{ts,js}',
	use: { baseURL: 'http://127.0.0.1:4173', storageState: 'tests/.auth/state.json' },
	webServer: {
		command: 'pnpm build:web && pnpm preview -- --host 127.0.0.1 --port 4173 --strictPort',
		env: testEnv,
		url: 'http://127.0.0.1:4173',
		timeout: 240_000,
		reuseExistingServer: !process.env.CI
	},
	projects: [{ name: 'pwa' }]
});
