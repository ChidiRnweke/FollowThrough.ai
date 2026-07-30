import { describe, expect, it } from 'vitest';
import { submitAgentRunSchema } from '$lib/server/agent-request-factory';

/** RFC-4122 ids: the schema validates the variant nibble, unlike the domain fixtures. */
const alpha = '5f7a1c2e-8b3d-4a91-9c05-1d2e3f405060';
const beta = '5f7a1c2e-8b3d-4a91-9c05-1d2e3f405061';
const noteA = '6a1b2c3d-4e5f-4061-8273-849506172839';
const noteB = '6a1b2c3d-4e5f-4061-8273-84950617283a';

const snapshot = (overrides: Record<string, unknown> = {}) => ({
	version: 1,
	capturedAt: '2026-07-11T09:00:00.000Z',
	client: { locale: 'en-GB', timeZone: 'Europe/Brussels', localDate: '2026-07-11', layout: 'wide' },
	surface: { kind: 'project', presentation: 'full_page' },
	currentProject: { id: alpha, name: 'Project Alpha' },
	recentInteractions: [],
	...overrides
});

const submission = (overrides: Record<string, unknown> = {}) => ({
	requestId: '10000000-0000-4000-8000-000000000001',
	input: 'Summarise this',
	...overrides
});

describe('agent submission schema', () => {
	it('accepts a staged project that the live snapshot has moved away from', () => {
		const result = submitAgentRunSchema.safeParse(
			submission({ projectId: beta, appContext: snapshot() })
		);
		expect(result.success).toBe(true);
	});

	it('accepts a staged note that the live snapshot has moved away from', () => {
		const result = submitAgentRunSchema.safeParse(
			submission({
				noteId: noteB,
				appContext: snapshot({
					surface: { kind: 'note_workbench', presentation: 'full_page' },
					workbench: { openTabs: [], visiblePanes: [], focusedNoteId: noteA }
				})
			})
		);
		expect(result.success).toBe(true);
	});

	it('still rejects a malformed identifier', () => {
		expect(submitAgentRunSchema.safeParse(submission({ projectId: 'not-a-uuid' })).success).toBe(
			false
		);
	});
});
