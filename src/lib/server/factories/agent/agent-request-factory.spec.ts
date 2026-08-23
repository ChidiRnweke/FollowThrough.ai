import { describe, expect, it } from 'vitest';
import { submitAgentRunSchema } from '$lib/server/factories/agent/agent-request-factory';
import { APP_SURFACE_KINDS } from '$lib/models/workspace/app-context';

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

describe('every screen the app can report', () => {
	// The validator once restated the surface list instead of deriving it, and the
	// two drifted: chats sent from the diagram gallery and the studio came back a
	// bare 400 before reaching the agent. A surface the app can report and the
	// server cannot accept is not a validation rule, it is a dead screen.
	it.each(APP_SURFACE_KINDS)('is a surface a run may be submitted from: %s', (kind) => {
		expect(
			submitAgentRunSchema.safeParse(
				submission({ appContext: snapshot({ surface: { kind, presentation: 'full_page' } }) })
			).success
		).toBe(true);
	});
});

describe('images the app supplies rather than the user', () => {
	const png = {
		mediaType: 'image/png' as const,
		dataUrl: 'data:image/png;base64,AAAA',
		name: 'r.png'
	};

	// A readable `canvas-<session>` id was rejected here and failed the whole
	// message with a bare 400, which is how a render of the canvas broke chat.
	it('requires the id to be the uuid the schema asks for', () => {
		expect(
			submitAgentRunSchema.safeParse(
				submission({ contextImages: [{ ...png, id: 'canvas-not-a-uuid' }] })
			).success
		).toBe(false);
	});

	it('accepts a render carrying a real uuid', () => {
		expect(
			submitAgentRunSchema.safeParse(submission({ contextImages: [{ ...png, id: noteA }] })).success
		).toBe(true);
	});
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
