import type { Locator, Page } from '@playwright/test';
import type { ScreenshotId } from '../../src/lib/components/marketing/screenshots.ts';
import type { ShowcaseIds } from './showcase.ts';
import type { WalkthroughMoment } from './walkthrough.ts';

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
	/** The walkthrough moment the scene shows. The walkthrough advances to it first. */
	readonly moment?: WalkthroughMoment;
	/** Where the pointer rests for the shot: out of the way, or where `ready` left it. */
	readonly pointer?: 'stay';
	/** The region to capture, or the whole viewport when absent. */
	readonly region?: (page: Page) => Locator;
}

const desktop = { width: 1440, height: 900 } as const;

/** Tall enough for a report page to reach its first chart's conclusion. */
const tall = { width: 1440, height: 1000 } as const;

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

/** Open the agent panel beside the open note and show one stored conversation in it. */
const openChat = async (page: Page, title: string, until: string): Promise<void> => {
	await noteBody(page).waitFor();
	await page.getByRole('button', { name: 'Toggle chat panel' }).click();
	const panel = page.getByRole('complementary', { name: 'Agent' });
	await panel.waitFor();
	const shown = panel.getByText(until).first();
	// Rows seeded just before the page loaded can still be arriving through sync, and their
	// arrival resets the panel to its start page. Open the chat until it stays open.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		if (!(await shown.isVisible())) {
			const row = panel.getByText(title.slice(0, 24)).first();
			// The panel may have opened another conversation; its start page lists them all.
			if (!(await row.isVisible())) await panel.getByRole('button', { name: 'New chat' }).click();
			await row.click();
		}
		await shown.waitFor();
		await page.waitForTimeout(3000);
		if (await shown.isVisible()) break;
	}
	await shown.waitFor();
	// A long turn opens partway down; show its end, as a reader who just ran it would see.
	const latest = panel.getByRole('button', { name: 'Jump to latest' });
	if (await latest.isVisible()) {
		await latest.click();
		await latest.waitFor({ state: 'hidden' });
	}
};

const openConversation = (page: Page, ids: ShowcaseIds): Promise<void> =>
	openChat(page, ids.conversationTitle, ids.closingLine);

/** The Connections tab, once its map has laid out. */
const openConnections = async (page: Page): Promise<void> => {
	await page.getByRole('tab', { name: 'Connections' }).click();
	await page.getByRole('button', { name: 'Ask about connections' }).waitFor();
	await settled(
		page
			.locator('svg')
			.filter({ has: page.locator('circle') })
			.first()
	);
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
	},
	'agent-activity': {
		path: (ids) => `/projects/${ids.projectId}/agent-activity`,
		viewport: tall,
		ready: async (page) => {
			await page.getByRole('heading', { name: 'What to do' }).waitFor();
			await page.getByText('Busiest week').waitFor();
		}
	},
	'agent-connections': {
		path: (ids) => `/projects/${ids.projectId}/agent-activity`,
		viewport: desktop,
		ready: openConnections
	},
	'connections-ask': {
		path: (ids) => `/projects/${ids.projectId}/agent-activity`,
		viewport: docked,
		ready: async (page) => {
			await openConnections(page);
			const question = 'Which notes are always read together?';
			await page.getByRole('button', { name: 'Ask about connections' }).click();
			const panel = page.getByRole('complementary', { name: 'Agent' });
			await panel.getByText('Connections · Acme rebrand').first().waitFor();
			// The other questions wait in the empty chat as its starters.
			await panel.getByText('Or ask').waitFor();
			// The question is prefilled into the composer and waits there; it is never sent.
			await page.waitForFunction(
				(text) =>
					document.querySelector<HTMLTextAreaElement>('#chat-composer')?.value.includes(text),
				question
			);
		}
	},
	'walkthrough-01-context': {
		path: (ids) => `/projects/${ids.walkthrough.ids.projectId}`,
		viewport: docked,
		moment: 1,
		ready: async (page) => {
			await page.getByText('Planning notes').first().waitFor();
			await page.getByText('Attachments').first().waitFor();
		}
	},
	'walkthrough-02-agent-acts': {
		path: (ids) => `/notes/${ids.walkthrough.ids.releasePlanNoteId()}`,
		viewport: docked,
		moment: 2,
		ready: (page) => openChat(page, 'Read the launch brief', 'seven launch tasks are on the board')
	},
	'walkthrough-03-extract-promise': {
		path: (ids) => `/notes/${ids.walkthrough.ids.releasePlanNoteId()}`,
		viewport: docked,
		moment: 3,
		ready: async (page) => {
			const promise = noteBody(page).getByText('I will verify every redirect on staging');
			await promise.waitFor();
			await promise.scrollIntoViewIfNeeded();
			await page.getByRole('button', { name: 'Accept' }).first().waitFor();
			// Select the sentence, as the reader did before choosing Extract promises. The editor
			// follows the document selection, so a range over the text is a real selection.
			await promise.evaluate((element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
			});
			await page
				.locator('[data-selection-menu]')
				.getByRole('button', { name: 'Extract promises' })
				.waitFor();
		},
		pointer: 'stay'
	},
	'walkthrough-04-widget-proposal': {
		path: (ids) => `/notes/${ids.walkthrough.ids.releasePlanNoteId()}`,
		viewport: docked,
		moment: 4,
		ready: async (page) => {
			await openChat(page, 'Build an interactive', 'Stage durations (days)');
			const approve = page
				.getByRole('complementary', { name: 'Agent' })
				.getByRole('button', { name: 'Approve' })
				.first();
			await approve.waitFor();
			await approve.scrollIntoViewIfNeeded();
			await page.getByRole('button', { name: 'Jump to latest' }).waitFor({ state: 'hidden' });
		}
	},
	'walkthrough-05-widget-result': {
		path: (ids) => `/notes/${ids.walkthrough.ids.releasePlanNoteId()}`,
		viewport: docked,
		moment: 5,
		ready: async (page) => {
			const simulator = noteBody(page).getByText('Critical-Path Simulator').first();
			await simulator.waitFor();
			await simulator.scrollIntoViewIfNeeded();
			await noteBody(page).getByText('Content stream').first().waitFor();
		}
	}
};
