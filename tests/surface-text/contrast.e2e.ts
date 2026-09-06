import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { inspectSurfaceText } from '../helpers/surface-text';

for (const theme of ['light', 'dark']) {
	test(`header and colored surfaces remain readable in ${theme} mode`, async ({
		page
	}, testInfo) => {
		await page.goto('/notes/00000000-0000-4000-8003-000000000002');
		await page.evaluate((mode) => {
			localStorage.setItem('mode-watcher-mode', mode);
			document.documentElement.classList.toggle('dark', mode === 'dark');
		}, theme);
		await page.locator('[data-surface-fixture]').waitFor();
		const results: { state: string; samples: ReturnType<typeof inspectSurfaceText> }[] = [];
		const sample = async (state: string) => {
			await page.waitForFunction(
				() =>
					!document
						.querySelector('[data-surface-fixture]')
						?.getAnimations({ subtree: true })
						.some(
							(animation) =>
								animation.playState === 'running' &&
								animation.effect?.getComputedTiming().iterations !== Infinity
						)
			);
			const samples = await page.locator('[data-surface-fixture]').evaluate(inspectSurfaceText);
			if (samples.length === 0) throw new Error(`No rendered text was measured for ${state}.`);
			results.push({ state, samples });
		};
		await page.getByText('Quoted text on a user message.').waitFor();
		await sample('resting, focused, split and pinned');
		await page.locator('[role=button][data-selected][data-value]').hover();
		await sample('selected calendar day hover');
		await page
			.getByRole('tablist')
			.screenshot({ path: testInfo.outputPath(`header-${theme}.png`) });
		await page.getByRole('button', { name: 'Close all 3 tabs' }).hover();
		await sample('close all hover');
		await page.keyboard.press('Tab');
		await page.getByRole('button', { name: 'Close all 3 tabs' }).focus();
		await sample('close all focus');
		for (const title of ['rossel', 'portima RFP', 'Meeting notes']) {
			await page.getByRole('tab', { name: title, exact: true }).hover();
			await sample(`${title} hover`);
		}
		for (const label of ['Search notes', 'Write a question', 'Find a project']) {
			await page.getByRole('textbox', { name: label }).focus();
			await sample(`${label} focus`);
		}
		await page.screenshot({ path: testInfo.outputPath(`surfaces-${theme}.png`) });
		await page.getByRole('button', { name: 'General', exact: true }).click();
		await sample('folded');
		await page.getByRole('button', { name: 'General', exact: true }).click();
		await page.setViewportSize({ width: 390, height: 844 });
		await sample('overflow');
		await page.goto('/today?empty=1');
		await page.evaluate(
			(mode) => document.documentElement.classList.toggle('dark', mode === 'dark'),
			theme
		);
		await page.getByLabel('No notes open').waitFor();
		await sample('empty');
		const reportPath = testInfo.outputPath('surface-text-report.json');
		await writeFile(reportPath, JSON.stringify(results, null, 2));
		await testInfo.attach('surface-text-report', {
			path: reportPath,
			contentType: 'application/json'
		});
		// Painted tab separator pseudo-elements require manual review but cannot obscure
		// centered labels. Retain their samples in the report instead of calling them passes.
		expect(
			results.flatMap(({ state, samples }) =>
				samples
					.filter(
						(s) =>
							s.status === 'contrast' ||
							(s.status === 'review' &&
								s.reasons.some(
									(reason) => reason !== 'Painted pseudo-element requires visual review.'
								))
					)
					.map((sample) => ({ state, ...sample }))
			)
		).toEqual([]);
	});
}

test('composited parent opacity can make otherwise opaque text fail', async ({ page }) => {
	await page.setContent(
		'<body style="background:white"><div style="opacity:.3;background:teal"><span style="color:white">Secondary text</span></div></body>'
	);
	expect((await page.locator('span').evaluate(inspectSurfaceText))[0].status).toBe('contrast');
});

test('an opaque nested surface hides a colored ancestor', async ({ page }) => {
	await page.setContent(
		'<body style="background:teal"><div style="background:white;color:black">Readable text</div></body>'
	);
	expect((await page.locator('div').evaluate(inspectSurfaceText))[0].ratio).toBe(21);
});

test('gradients require review instead of a guessed contrast result', async ({ page }) => {
	await page.setContent(
		'<body style="background:white"><div style="background:linear-gradient(teal,white)">Review text</div></body>'
	);
	expect((await page.locator('div').evaluate(inspectSurfaceText))[0].status).toBe('review');
});

test('disabled text remains separate from enabled-text failures', async ({ page }) => {
	await page.setContent(
		'<body style="background:white"><button disabled style="opacity:.2">Disabled</button></body>'
	);
	expect((await page.locator('button').evaluate(inspectSurfaceText))[0].status).toBe('disabled');
});
