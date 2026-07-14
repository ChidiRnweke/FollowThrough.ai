import { expect, test, type Page } from '@playwright/test';

const openHome = async (page: Page) => {
	await page.goto('/');
	await page.locator('#quick-capture-input').waitFor();
};

const chord = async (page: Page, key: string) => {
	await page.keyboard.press('Control+K');
	await page.keyboard.press(key);
};

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

	test('Mod+Alt+I opens chat and focuses its composer', async ({ page }) => {
		await openHome(page);
		await page.keyboard.press('Control+Alt+I');
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
		await page.route('**/api/agent', async (route) => {
			await route.fulfill({
				contentType: 'application/x-ndjson',
				body:
					JSON.stringify({
						type: 'approval_required',
						runId: '00000000-0000-4000-8000-000000000091',
						callId: 'call-approval',
						name: 'create_note',
						arguments: { title: 'Reviewed draft' }
					}) + '\n'
			});
		});
		await openHome(page);
		await page.keyboard.press('Control+Alt+I');
		await page.locator('#chat-composer').fill('Create a reviewed draft');
		await page.getByLabel('Send message').click();
		await expect(page.getByText('"title": "Reviewed draft"')).toBeVisible();
	});

	test('returns a rejection to the same visible conversation', async ({ page }) => {
		await page.route('**/api/agent', async (route) => {
			await route.fulfill({
				contentType: 'application/x-ndjson',
				body:
					JSON.stringify({
						type: 'approval_required',
						runId: '00000000-0000-4000-8000-000000000092',
						callId: 'call-reject',
						name: 'archive_note',
						arguments: { noteId: '00000000-0000-4000-8000-000000000093' }
					}) + '\n'
			});
		});
		await page.route('**/api/agent/runs/*/decision', async (route) => {
			await route.fulfill({
				contentType: 'application/x-ndjson',
				body:
					JSON.stringify({ type: 'text_delta', text: 'I kept the note and continued.' }) +
					'\n' +
					JSON.stringify({
						type: 'completed',
						conversationId: '00000000-0000-4000-8000-000000000094'
					}) +
					'\n'
			});
		});
		await openHome(page);
		await page.keyboard.press('Control+Alt+I');
		await page.locator('#chat-composer').fill('Archive this note');
		await page.getByLabel('Send message').click();
		await page.getByRole('button', { name: 'Reject' }).click();
		await expect(page.getByText('I kept the note and continued.')).toBeVisible();
	});

	test('sends auto-accept as the conversation execution-mode override', async ({ page }) => {
		let executionMode: unknown;
		await page.route('**/api/agent', async (route) => {
			executionMode = (route.request().postDataJSON() as { executionModeOverride?: unknown })
				.executionModeOverride;
			await route.fulfill({
				contentType: 'application/x-ndjson',
				body:
					JSON.stringify({
						type: 'completed',
						conversationId: '00000000-0000-4000-8000-000000000095'
					}) + '\n'
			});
		});
		await openHome(page);
		await page.keyboard.press('Control+Alt+I');
		await page.getByLabel('Allow agent changes automatically').click();
		await page.locator('#chat-composer').fill('Create without pausing');
		await page.getByLabel('Send message').click();
		await expect.poll(() => executionMode).toBe('auto_accept');
	});
});
