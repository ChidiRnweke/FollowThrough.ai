import { expect, test } from '@playwright/test';

for (const width of [1680, 1200]) {
	test(`stages a note prompt without sending at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/today');
		const noteLink = page.locator('a[href^="/notes/"]').first();
		await noteLink.waitFor();
		const href = await noteLink.getAttribute('href');
		if (!href) throw new Error('The workspace must contain a note for the handoff scenario');
		await page.goto(href);
		await page.getByRole('button', { name: 'Ask about this note', exact: true }).click();
		const composer = page.locator('#chat-composer');
		await composer.waitFor();
		await expect
			.poll(async () => ({
				prompt: await composer.inputValue(),
				activeRuns: await page.getByRole('button', { name: 'Stop generation', exact: true }).count()
			}))
			.toEqual({ prompt: expect.stringMatching(/\S/), activeRuns: 0 });
	});
}
