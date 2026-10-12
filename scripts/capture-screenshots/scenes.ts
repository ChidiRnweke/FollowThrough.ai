import type { Locator, Page } from '@playwright/test';
import type { ScreenshotId } from '../../src/lib/components/marketing/screenshots.ts';
import type { ShowcaseIds } from './showcase.ts';

/**
 * How each product screenshot is reached. Keyed by every `ScreenshotId`, so an id without a
 * scene, or a scene without an id, is a type error.
 */
export interface Scene {
	/** The route to open, given the ids the seed produced. */
	readonly path: (ids: ShowcaseIds) => string;
	/** CSS pixels. Retina capture doubles them. */
	readonly viewport: { readonly width: number; readonly height: number };
	/** Bring the page into the captured state and wait until it is settled. */
	readonly ready: (page: Page, ids: ShowcaseIds) => Promise<void>;
	/** Where the pointer rests for the shot: out of the way, or where `ready` left it. */
	readonly pointer?: 'stay';
	/** The region to capture, or the whole viewport when absent. */
	readonly region?: (page: Page) => Locator;
}

const desktop = { width: 1440, height: 900 } as const;

/** The right panel docks only at 96rem and wider; narrower, it is a modal sheet. */
const docked = { width: 1600, height: 1000 } as const;

const noteBody = (page: Page): Locator =>
	page.getByRole('textbox', { name: 'Note body', exact: true });

/** Wait until a region stops changing size: diagrams lay out and scale after they mount. */
const settled = async (region: Locator): Promise<void> => {
	let previous = JSON.stringify(await region.boundingBox());
	for (let attempt = 0; attempt < 40; attempt += 1) {
		await region.page().waitForTimeout(250);
		const current = JSON.stringify(await region.boundingBox());
		if (current === previous) return;
		previous = current;
	}
	throw new Error('The captured region kept changing size for 10 seconds.');
};

const openSettingsTab = (name: string) => async (page: Page) => {
	await page.getByRole('tab', { name, selected: true }).waitFor();
};

/** Select the opening words of the first paragraph, which raises the selection toolbar. */
const selectOpeningWords = async (page: Page): Promise<void> => {
	const paragraph = noteBody(page).locator('p').first();
	await paragraph.waitFor();
	await paragraph.click({ position: { x: 2, y: 8 } });
	await page.keyboard.press('Home');
	for (let character = 0; character < 64; character += 1)
		await page.keyboard.press('Shift+ArrowRight');
	await page.getByRole('button', { name: 'Ask about this' }).waitFor();
};

/** Open the agent panel beside the note and show the seeded conversation. */
const openConversation = async (page: Page, ids: ShowcaseIds): Promise<void> => {
	await noteBody(page).waitFor();
	await page.getByRole('button', { name: 'Toggle chat panel' }).click();
	const panel = page.getByRole('complementary', { name: 'Agent' });
	await panel.waitFor();
	const closing = panel.getByText(ids.closingLine);
	if (!(await closing.isVisible())) {
		await panel.getByRole('button', { name: ids.conversationTitle }).first().click();
	}
	await closing.waitFor();
};

export const scenes: Readonly<Record<ScreenshotId, Scene>> = {
	'today-screen': {
		path: () => '/today',
		viewport: desktop,
		ready: async (page) => {
			await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
			await page.getByText('Legal sign-off on trademark usage').first().waitFor();
		}
	},
	'todo-board': {
		path: () => '/todos?view=board',
		viewport: desktop,
		ready: async (page) => {
			await page.getByText('Approve the homepage hero copy').first().waitFor();
		}
	},
	'note-view': {
		path: (ids) => `/notes/${ids.briefNoteId}`,
		viewport: desktop,
		ready: async (page) => {
			await noteBody(page).getByText('Commitments from the kickoff').waitFor();
		}
	},
	'project-context': {
		path: (ids) => `/projects/${ids.projectId}`,
		viewport: desktop,
		ready: async (page) => {
			await page.getByText('Rebrand brief').first().waitFor();
		}
	},
	'skill-support': {
		path: (ids) => `/skills/${ids.diagrammingSkillId}`,
		viewport: desktop,
		ready: async (page) => {
			await page.getByRole('textbox', { name: 'Skill instructions' }).waitFor();
		}
	},
	tools: {
		path: () => '/settings?tab=tools',
		viewport: desktop,
		ready: openSettingsTab('Tools')
	},
	'mcp-settings': {
		path: () => '/settings?tab=mcp',
		viewport: desktop,
		ready: async (page) => {
			await openSettingsTab('MCP access')(page);
			await page.getByText('Claude Desktop').first().waitFor();
		}
	},
	'open-model-access': {
		path: () => '/settings?tab=models',
		viewport: desktop,
		ready: async (page) => {
			await openSettingsTab('Models')(page);
			await page.getByRole('button', { name: 'App default' }).first().click();
			await page.getByPlaceholder('Search models…').waitFor();
			const options = page.getByRole('option');
			await options.first().waitFor();
			if ((await options.count()) < 2)
				throw new Error(
					'The model picker listed no models. Run against `pnpm dev` with a real .env.'
				);
		}
	},
	'diagram-render': {
		path: (ids) => `/notes/${ids.architectureNoteId}`,
		viewport: desktop,
		ready: async (page) => {
			const diagram = page.locator('.diagram-node').first();
			await settled(diagram.locator('svg').first());
			// Hovering shows the diagram's toolbar: convert to draw.io, revise with AI, edit.
			await diagram.hover();
			await diagram.getByRole('button', { name: 'Convert to draw.io' }).waitFor();
		},
		pointer: 'stay',
		region: (page) => page.locator('.diagram-node').first()
	},
	'in-editor-ai': {
		path: (ids) => `/notes/${ids.briefNoteId}`,
		viewport: desktop,
		ready: selectOpeningWords,
		region: (page) => page.locator('[data-selection-menu]')
	},
	'in-editor-chat': {
		path: (ids) => `/notes/${ids.briefNoteId}`,
		viewport: docked,
		ready: openConversation
	},
	'agent-tab': {
		path: (ids) => `/notes/${ids.briefNoteId}`,
		viewport: docked,
		ready: openConversation,
		region: (page) => page.getByRole('complementary', { name: 'Agent' })
	}
};
