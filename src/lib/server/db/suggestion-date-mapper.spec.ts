import { expect, it } from 'vitest';
import { toStoredSuggestion, toSuggestion } from './mappers';

const instant = new Date('2026-09-23T10:00:00.000Z');
const row = (dueDate?: string): Parameters<typeof toSuggestion>[0] => ({
	id: '10000000-0000-4000-8000-000000000001',
	userId: '20000000-0000-4000-8000-000000000002',
	noteId: null,
	kind: 'todo',
	status: 'proposed',
	payload: {
		projectId: '30000000-0000-4000-8000-000000000003',
		title: 'Send the draft',
		responsibility: 'mine',
		...(dueDate === undefined ? {} : { dueDate })
	},
	confidence: null,
	provenanceId: '40000000-0000-4000-8000-000000000004',
	sourceAnchorId: null,
	decidedAt: null,
	expiresAt: null,
	appliedArtifactType: null,
	appliedArtifactId: null,
	isAutoAccepted: false,
	createdAt: instant,
	updatedAt: instant
});

it.each(['2026-02-30', '2025-02-29', 'tomorrow', '2026-09-23T10:00:00Z'])(
	'reports a stored task proposal with invalid date %s as unreadable',
	(dueDate) => {
		expect(toStoredSuggestion(row(dueDate))).toMatchObject({ status: 'unreadable', id: row().id });
	}
);

it('rejects an invalid task date through the strict single-proposal read', () => {
	expect(() => toSuggestion(row('2026-02-30'))).toThrow();
});

it('preserves a valid leap-day task proposal', () => {
	expect(toSuggestion(row('2028-02-29')).payload).toMatchObject({ dueDate: '2028-02-29' });
});

it('keeps task proposals without a resolved date readable', () => {
	expect(toStoredSuggestion(row()).status).toBe('readable');
});
