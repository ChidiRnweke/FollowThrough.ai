import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'pnpm build && pnpm preview', port: 4173, timeout: 120_000 },
	testMatch: '**/*.e2e.{ts,js}'
});
