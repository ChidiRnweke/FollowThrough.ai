import { describe, expect, it } from 'vitest';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { AgentPreferences } from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteChangeReview } from '$lib/models/notes';
import { approvalPreview } from './tool-approval-preview';

const note = noteBuilder({
	title: 'Release',
	document: {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monday' }] }]
	}
});
const review: NoteChangeReview = {
	kind: 'prepared',
	change: {
		noteId: note.id,
		base: { revision: 1, title: note.title, document: note.document },
		result: {
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tuesday' }] }]
			},
			plainText: 'Tuesday'
		},
		operation: { kind: 'replace' }
	}
};

describe('Previewing the saved note review', () => {
	it('renders the prepared pair without loading a current note', () => {
		expect(
			approvalPreview(
				'save_note',
				{ noteId: note.id, markdown: 'Different text' },
				{ kind: 'note_review', review }
			)
		).toMatchObject({
			kind: 'note',
			change: {
				kind: 'prepared',
				title: 'Release',
				body: { base: note.document, candidate: review.change.result.document }
			}
		});
	});
	it('does not rerun targeted edits while rendering a review', () => {
		expect(
			approvalPreview(
				'edit_note',
				{ noteId: note.id, edits: [{ oldText: 'missing', newText: 'Different' }] },
				{ kind: 'note_review', review }
			)
		).toMatchObject({
			kind: 'note',
			change: { body: { candidate: review.change.result.document } }
		});
	});
	it('shows the prepared revision and the stale-review policy', () => {
		expect(approvalPreview('save_note', {}, { kind: 'note_review', review })).toMatchObject({
			kind: 'note',
			change: { kind: 'prepared', revision: 1 }
		});
	});
	it('shows explicit preparation failures', () => {
		expect(
			approvalPreview(
				'edit_note',
				{},
				{ kind: 'note_review', review: { kind: 'failure', problems: ['Anchor was not found.'] } }
			)
		).toMatchObject({ kind: 'note', change: { problems: ['Anchor was not found.'] } });
	});
	it('requires fresh review for legacy calls instead of inventing a before-image', () => {
		expect(approvalPreview('save_note', { markdown: 'New' }, { kind: 'none' })).toMatchObject({
			kind: 'note',
			change: {
				kind: 'failure',
				problems: ['This approval has no saved review. Reject this call and request a new review.']
			}
		});
	});
	it('leaves unrelated tools on their argument presentation', () => {
		expect(approvalPreview('create_todo', { title: 'Renew certs' }, { kind: 'none' })).toEqual({
			kind: 'arguments'
		});
	});
});

/**
 * "Default model: openai/gpt-5.6" cannot be approved on its own terms: it does not say
 * whether that is a change at all, let alone from what. The card holds the preferences in
 * force, so the question it asks can name both sides.
 */
describe('reviewing a change to the settings the agent runs under', () => {
	const preferences = {
		defaultModel: 'openai/gpt-5.6',
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true
	} as unknown as AgentPreferences;

	const settings = (args: AgentPayloadObject) =>
		approvalPreview('update_agent_preferences', args, { kind: 'preferences', preferences });

	it('states the model being replaced alongside the one replacing it', () => {
		const preview = settings({ defaultModel: 'anthropic/claude-sonnet-4.5' });
		expect(preview.kind === 'settings' && preview.change.changes).toEqual([
			{ label: 'Default model', from: 'openai/gpt-5.6', to: 'anthropic/claude-sonnet-4.5' }
		]);
	});

	it('says so rather than pointing an arrow at itself when nothing would move', () => {
		const preview = settings({ defaultModel: 'openai/gpt-5.6' });
		expect(preview.kind === 'settings' && preview.change.notice).toBeDefined();
	});

	it('drops the fields already holding the proposed value', () => {
		const preview = settings({ defaultModel: 'openai/gpt-5.6', agentMaxTurns: 20 });
		expect(preview.kind === 'settings' && preview.change.changes.map((c) => c.label)).toEqual([
			'Agent max turns'
		]);
	});

	it('links to the tab that owns the field, not the settings page in general', () => {
		const preview = settings({ agentMaxTurns: 20 });
		expect(preview.kind === 'settings' && preview.change.settingsHref).toBe('/settings?tab=agents');
	});

	it('states a value with no stored counterpart on its own', () => {
		const preview = settings({ inlineModel: 'openai/gpt-5.6-mini' });
		expect(preview.kind === 'settings' && preview.change.changes[0]?.from).toBeUndefined();
	});
});
