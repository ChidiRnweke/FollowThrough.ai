import { expect, test, type Page } from '@playwright/test';

type SidebarLayoutProbeWindow = Window & {
	__sidebarHydrationOvershoot?: Promise<number>;
};

async function installSidebarHydrationProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probeWindow = window as SidebarLayoutProbeWindow;
		probeWindow.__sidebarHydrationOvershoot = new Promise<number>((resolve) => {
			window.addEventListener(
				'DOMContentLoaded',
				() => {
					let frame = 0;
					let maximumOvershoot = 0;

					const sample = (): void => {
						for (const collapse of document.querySelectorAll<HTMLElement>('.tree-collapse')) {
							const content = collapse.firstElementChild as HTMLElement | null;
							if (!content) continue;
							maximumOvershoot = Math.max(
								maximumOvershoot,
								collapse.getBoundingClientRect().height - content.scrollHeight
							);
						}

						frame += 1;
						if (frame < 30) requestAnimationFrame(sample);
						else resolve(maximumOvershoot);
					};

					requestAnimationFrame(sample);
				},
				{ once: true }
			);
		});
	});
}

test('project branches cannot exceed their content height while hydration restores expansion', async ({
	page
}) => {
	await installSidebarHydrationProbe(page);
	await page.goto('/');
	const overshoot = await page.evaluate(
		() => (window as SidebarLayoutProbeWindow).__sidebarHydrationOvershoot
	);
	expect(overshoot).toBeLessThan(2);
});

test('the workspace shell hydrates without runtime failures', async ({ page }) => {
	const hydrationFailures: string[] = [];
	page.on('console', (message) => {
		if (message.text().includes('Failed to hydrate')) hydrationFailures.push(message.text());
	});

	await page.goto('/');
	await page.waitForLoadState('networkidle');

	expect(hydrationFailures).toEqual([]);
});

test('the workspace shell cannot create document-level scrolling', async ({ page }) => {
	await page.goto('/');
	const documentFitsViewport = await page.evaluate(
		() =>
			document.documentElement.scrollWidth === document.documentElement.clientWidth &&
			document.documentElement.scrollHeight === document.documentElement.clientHeight
	);
	expect(documentFitsViewport).toBe(true);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('server-rendered shell elements stay inside the viewport wrapper', async ({ page }) => {
		await page.goto('/');
		const shellFitsViewport = await page.evaluate(() => {
			const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
			const inset = document.querySelector('[data-slot="sidebar-inset"]');
			const footer = document.querySelector('[data-slot="sidebar-footer"]');
			const rightPanel = document.querySelector('aside[aria-hidden]');

			return (
				wrapper !== null &&
				inset !== null &&
				footer !== null &&
				rightPanel !== null &&
				wrapper.contains(inset) &&
				wrapper.contains(footer) &&
				wrapper.contains(rightPanel) &&
				document.documentElement.scrollWidth === document.documentElement.clientWidth &&
				document.documentElement.scrollHeight === document.documentElement.clientHeight
			);
		});

		expect(shellFitsViewport).toBe(true);
	});
});
