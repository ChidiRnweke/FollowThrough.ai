import { expect, test, type Page } from '@playwright/test';

const conversationId = '00000000-0000-4000-8000-000000000094';
const timestamp = '2026-07-17T20:00:00.000Z';

const remoteResult = (value: unknown) => {
	const nodes: unknown[] = [];
	const flatten = (item: unknown): number => {
		const index = nodes.length;
		nodes.push(null);
		if (Array.isArray(item)) nodes[index] = item.map(flatten);
		else if (item !== null && typeof item === 'object')
			nodes[index] = Object.fromEntries(
				Object.entries(item as Record<string, unknown>)
					.filter(([, child]) => child !== undefined)
					.map(([key, child]) => [key, flatten(child)])
			);
		else nodes[index] = item;
		return index;
	};
	flatten({ _: value });
	return JSON.stringify({ type: 'result', data: JSON.stringify(nodes) });
};

const runReceipt = (runId: string) => ({
	runId,
	conversationId,
	status: 'queued',
	latestCursor: '0'
});

const runSnapshot = (runId: string, status: 'queued' | 'awaiting_approval') => ({
	run: {
		id: runId,
		userId: '00000000-0000-4000-8000-000000000001',
		conversationId,
		requestId: '00000000-0000-4000-8000-000000000099',
		model: 'openai/test',
		executionMode: 'approval_required',
		status,
		attemptCount: 1,
		maxAttempts: 3,
		nextAttemptAt: timestamp,
		pendingDecisions: [],
		inputSnapshot: { prompt: 'test' },
		contextSnapshot: {},
		createdAt: timestamp,
		updatedAt: timestamp
	},
	latestCursor: '2',
	pendingDecisions: [],
	retryMayRepeatSideEffects: false
});

const eventStream = (
	runId: string,
	events: readonly Readonly<Record<string, unknown>>[],
	startCursor = 1,
	attempt = 1
) =>
	events
		.map((event, index) => {
			const cursor = String(startCursor + index);
			return `id: ${cursor}\nevent: agent\ndata: ${JSON.stringify({ cursor, runId, attempt, event, createdAt: timestamp })}\n\n`;
		})
		.join('');

const mockSubmit = async (page: Page, runId: string) => {
	await page.route('**/_app/remote/*/submitAgentRun', async (route) => {
		await route.fulfill({ contentType: 'application/json', body: remoteResult(runReceipt(runId)) });
	});
};

const openHome = async (page: Page) => {
	await page.goto('/today');
	await page.locator('#quick-capture-input').waitFor();
};

const openChat = async (page: Page) => {
	await page.getByLabel('Toggle chat panel').click();
	const panel = page.locator('aside[aria-label="Chat"]');
	await expect(panel).toHaveAttribute('aria-hidden', 'false');
	await expect(panel).toHaveCSS('width', '384px');
	return panel;
};

const chord = async (page: Page, key: string) => {
	await page.keyboard.press('Control+K');
	await page.keyboard.press(key);
};

test('workspace state restores without an SSR hydration mismatch on refresh', async ({ page }) => {
	const hydrationErrors: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (text.includes('hydration_mismatch') || text.includes('Hydration failed'))
			hydrationErrors.push(text);
	});
	await page.addInitScript(() => {
		sessionStorage.setItem(
			'followthrough.agent.conversation',
			JSON.stringify({ executionModeOverride: 'auto_accept' })
		);
	});
	await openHome(page);
	const noteHref = await page.locator('a[href^="/notes/"]').first().getAttribute('href');
	if (!noteHref) throw new Error('A note is required for the hydration regression test');
	await page.goto(noteHref);
	hydrationErrors.length = 0;
	await page.reload();
	await page.waitForLoadState('networkidle');
	expect(hydrationErrors).toEqual([]);
});

test.describe.serial('agent-native keyboard workflow', () => {
	test('Mod+Shift+P opens the shared command palette with shortcut hints', async ({ page }) => {
		await openHome(page);
		await page.keyboard.press('Control+Shift+P');
		await expect(page.getByText('⌘K N')).toBeVisible();
	});

	test('Mod+K then Q focuses quick capture', async ({ page }) => {
		await openHome(page);
		await chord(page, 'q');
		await expect(page.locator('#quick-capture-input')).toBeFocused();
	});

	test('Mod+K then T opens quick todo creation', async ({ page }) => {
		await openHome(page);
		await chord(page, 't');
		await expect(page.locator('#quick-todo-input')).toBeFocused();
	});

	test('Mod+K then C toggles the chat side pane', async ({ page }) => {
		await openHome(page);
		await chord(page, 'c');
		await expect(page.locator('#chat-composer')).toBeVisible();
	});

	test('Mod+Shift+I opens chat and focuses its composer', async ({ page }) => {
		await openHome(page);
		await page.keyboard.press('Control+Shift+I');
		await expect(page.locator('#chat-composer')).toBeFocused();
	});

	test('Mod+, opens Settings', async ({ page }) => {
		await openHome(page);
		await page.keyboard.press('Control+,');
		await expect(page).toHaveURL(/\/settings$/);
	});

	test('Mod+K then N creates an untitled note and focuses its title', async ({ page }) => {
		await openHome(page);
		await chord(page, 'n');
		await expect(page.getByLabel('Note title')).toBeFocused();
	});
});

test.describe('inline agent approvals', () => {
	test('renders an approval card with inspected arguments', async ({ page }) => {
		const runId = '00000000-0000-4000-8000-000000000091';
		await mockSubmit(page, runId);
		await page.route('**/api/agent/runs/*/events?after=*', async (route) => {
			await route.fulfill({
				contentType: 'text/event-stream',
				body: eventStream(runId, [
					{ type: 'run_started', runId, attempt: 1 },
					{
						type: 'approval_required',
						runId,
						callId: 'call-approval',
						name: 'create_note',
						arguments: { title: 'Reviewed draft' }
					}
				])
			});
		});
		await openHome(page);
		const panel = await openChat(page);
		await panel.locator('#chat-composer').fill('Create a reviewed draft');
		await panel.getByLabel('Send message').click();
		await expect(page.getByText('"title": "Reviewed draft"')).toBeVisible();
	});

	test('returns a rejection to the same visible conversation', async ({ page }) => {
		const runId = '00000000-0000-4000-8000-000000000092';
		await mockSubmit(page, runId);
		await page.route('**/_app/remote/*/decideAgentRun', async (route) => {
			await route.fulfill({
				contentType: 'application/json',
				body: remoteResult(runSnapshot(runId, 'queued'))
			});
		});
		await page.route('**/api/agent/runs/*/events?after=*', async (route) => {
			const after = new URL(route.request().url()).searchParams.get('after');
			const events =
				after === '0'
					? [
							{ type: 'run_started', runId, attempt: 1 },
							{
								type: 'approval_required',
								runId,
								callId: 'call-reject',
								name: 'archive_note',
								arguments: { noteId: '00000000-0000-4000-8000-000000000093' }
							}
						]
					: [
							{ type: 'run_started', runId, attempt: 2 },
							{ type: 'text_delta', text: 'I kept the note and continued.' },
							{ type: 'completed', runId, conversationId }
						];
			await route.fulfill({
				contentType: 'text/event-stream',
				body: eventStream(runId, events, after === '0' ? 1 : 3, after === '0' ? 1 : 2)
			});
		});
		await openHome(page);
		const panel = await openChat(page);
		await panel.locator('#chat-composer').fill('Archive this note');
		await panel.getByLabel('Send message').click();
		await page.getByRole('button', { name: 'Reject' }).click();
		await expect(page.getByText('I kept the note and continued.')).toBeVisible();
	});

	test('sends auto-accept as the conversation execution-mode override', async ({ page }) => {
		let executionMode: unknown;
		const runId = '00000000-0000-4000-8000-000000000095';
		await page.route('**/_app/remote/*/submitAgentRun', async (route) => {
			const payload = (route.request().postDataJSON() as { payload: string }).payload;
			executionMode = payload.includes('auto_accept') ? 'auto_accept' : undefined;
			await route.fulfill({
				contentType: 'application/json',
				body: remoteResult(runReceipt(runId))
			});
		});
		await page.route('**/api/agent/runs/*/events?after=*', async (route) => {
			await route.fulfill({
				contentType: 'text/event-stream',
				body: eventStream(runId, [
					{ type: 'run_started', runId, attempt: 1 },
					{ type: 'completed', runId, conversationId }
				])
			});
		});
		await openHome(page);
		const panel = await openChat(page);
		await panel.getByLabel('Allow agent changes automatically').click();
		await panel.locator('#chat-composer').fill('Create without pausing');
		await panel.getByLabel('Send message').click();
		await expect.poll(() => executionMode).toBe('auto_accept');
	});
});
