import { describe, expect, it } from 'vitest';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { AgentPreferences } from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { approvalPreview, targetNoteId, type ApprovalPreview } from './tool-approval-preview';

/** The body is a ProseMirror document now; reduce it back to text for an assertion. */
const candidateText = (preview: ApprovalPreview): string => {
	if (preview.kind !== 'note' || !preview.change.body) return '';
	return (preview.change.body.candidate.content ?? [])
		.map((block) => {
			const children = 'content' in block ? (block.content ?? []) : [];
			return children.map((node) => (node.type === 'text' ? node.text : '')).join('');
		})
		.join('\n\n');
};

const note = () =>
	noteBuilder({
		id: crypto.randomUUID() as never,
		title: 'Design',
		document: {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'The cache is write-through.' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'Revisit in Q3.' }] }
			]
		} as never,
		plainText: 'The cache is write-through.\n\nRevisit in Q3.'
	});

describe('Finding the note an approval touches', () => {
	/** The bug this replaces read `arguments.note`, a shape save_note never had. */
	it('reads the note id from a save_note payload', () => {
		const id = crypto.randomUUID();
		expect(targetNoteId('save_note', { noteId: id, markdown: '# x' })).toBe(id);
	});

	it('reads the note id from an edit_note payload', () => {
		const id = crypto.randomUUID();
		expect(targetNoteId('edit_note', { noteId: id, edits: [] })).toBe(id);
	});

	it('has no note to compare for an unrelated tool', () => {
		expect(targetNoteId('create_todo', { title: 'Renew certs' })).toBeUndefined();
	});
});

describe('Previewing a pending note change', () => {
	it('diffs a whole-body save against the current note', () => {
		const baseline = note();
		const preview = approvalPreview(
			'save_note',
			{ noteId: baseline.id, markdown: 'The cache is write-behind.\n\nRevisit in Q3.' },
			{ kind: 'note', note: baseline }
		);
		expect(candidateText(preview)).toContain('write-behind');
	});

	it('diffs a targeted edit against the current note', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'write-through', newText: 'write-behind' }] },
			{ kind: 'note', note: baseline }
		);
		expect(candidateText(preview)).toContain('write-behind');
	});

	it('keeps untargeted prose in the previewed result', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'write-through', newText: 'write-behind' }] },
			{ kind: 'note', note: baseline }
		);
		expect(candidateText(preview)).toContain('Revisit in Q3.');
	});

	/** Rejecting before approval beats approving and then being told it failed. */
	it('warns that an edit will be rejected when its anchor is missing', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'read-through', newText: 'x' }] },
			{ kind: 'note', note: baseline }
		);
		expect(preview.kind === 'note' && preview.change.problems).toHaveLength(1);
	});

	it('names the ambiguity when an anchor is not unique', () => {
		const baseline = noteBuilder({
			id: crypto.randomUUID() as never,
			title: 'Repeats',
			document: {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'same' }] },
					{ type: 'paragraph', content: [{ type: 'text', text: 'same' }] }
				]
			} as never,
			plainText: 'same\n\nsame'
		});
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'same', newText: 'other' }] },
			{ kind: 'note', note: baseline }
		);
		expect(preview.kind === 'note' && preview.change.problems[0]).toContain('appears 2 times');
	});

	it('says so when a save changes nothing a reader would notice', () => {
		const baseline = note();
		const preview = approvalPreview(
			'save_note',
			{ noteId: baseline.id, markdown: 'The cache is write-through.\n\nRevisit in Q3.' },
			{ kind: 'note', note: baseline }
		);
		expect(preview.kind === 'note' && preview.change.notices).toHaveLength(1);
	});

	it('falls back to argument summaries for a tool that is not a note change', () => {
		expect(
			approvalPreview('create_todo', { title: 'Renew certs' }, { kind: 'none' })
		).toMatchObject({
			kind: 'arguments'
		});
	});

	it('shows what would be written even when the current note cannot be loaded', () => {
		const preview = approvalPreview(
			'save_note',
			{ noteId: crypto.randomUUID(), markdown: '# x' },
			{ kind: 'none' }
		);
		expect(preview.kind === 'note' && Boolean(preview.change.body)).toBe(true);
	});

	it('says it could not compare, rather than marking every line as new', () => {
		const preview = approvalPreview(
			'save_note',
			{ noteId: crypto.randomUUID(), markdown: '# x' },
			{ kind: 'none' }
		);
		expect(preview.kind === 'note' && preview.change.comparable).toBe(false);
	});

	it('still summarises the arguments for a tool that is not a note change', () => {
		expect(
			approvalPreview('create_todo', { title: 'Renew certs' }, { kind: 'none' })
		).toMatchObject({
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
