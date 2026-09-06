import { describe, expect, it } from 'vitest';
import { submitAgentRunSchema } from '$lib/server/factories/agent/agent-request-factory';
import { APP_SURFACE_KINDS } from '$lib/models/workspace/app-context';

/** RFC-4122 ids: the schema validates the variant nibble, unlike the domain fixtures. */
const alpha = '5f7a1c2e-8b3d-4a91-9c05-1d2e3f405060';

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
