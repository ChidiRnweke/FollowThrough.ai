import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { inspectSurfaceText } from '../helpers/surface-text';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const theme of ['light', 'dark'] as const) {
	test(`colored app surfaces have readable text in ${theme} mode`, async ({ page }, testInfo) => {
		await page.addInitScript((mode) => localStorage.setItem('mode-watcher-mode', mode), theme);
		const report: { route: string; samples: ReturnType<typeof inspectSurfaceText> }[] = [];
		for (const route of ['/today', '/todos', '/notes', '/chats', '/settings']) {
			await page.goto(route);
			await page.getByRole('tablist', { name: 'Open notes' }).waitFor();
			await page.evaluate(
				(mode) => document.documentElement.classList.toggle('dark', mode === 'dark'),
				theme
			);
			const surfaces = page.locator(
				'[class*="bg-brand/"], [class*="bg-primary/"], [class*="bg-destructive/"], [class*="bg-success/"], [class*="bg-warning/"], [data-sidebar][data-active="true"]'
			);
			const samples: ReturnType<typeof inspectSurfaceText> = [];
			for (const surface of await surfaces.all())
				samples.push(...(await surface.evaluate(inspectSurfaceText)));
			report.push({ route, samples });
		}
		const path = testInfo.outputPath('app-surface-text-report.json');
		await writeFile(path, JSON.stringify(report, null, 2));
		await testInfo.attach('app-surface-text-report', { path, contentType: 'application/json' });
		expect(
			report.flatMap(({ route, samples }) =>
				samples
					.filter((sample) => sample.status === 'contrast')
					.map((sample) => ({ route, ...sample }))
			)
		).toEqual([]);
	});
}
