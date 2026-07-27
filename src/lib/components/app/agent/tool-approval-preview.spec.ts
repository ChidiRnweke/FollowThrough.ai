import { describe, expect, it } from 'vitest';
import { noteBuilder } from '$lib/testing/fixtures/domain-builders';
import { approvalPreview, targetNoteId } from './tool-approval-preview';

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
			baseline
		);
		expect(preview.kind === 'note' && preview.change.body?.candidate).toContain('write-behind');
	});

	it('diffs a targeted edit against the current note', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'write-through', newText: 'write-behind' }] },
			baseline
		);
		expect(preview.kind === 'note' && preview.change.body?.candidate).toContain('write-behind');
	});

	it('keeps untargeted prose in the previewed result', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'write-through', newText: 'write-behind' }] },
			baseline
		);
		expect(preview.kind === 'note' && preview.change.body?.candidate).toContain('Revisit in Q3.');
	});

	/** Rejecting before approval beats approving and then being told it failed. */
	it('warns that an edit will be rejected when its anchor is missing', () => {
		const baseline = note();
		const preview = approvalPreview(
			'edit_note',
			{ noteId: baseline.id, edits: [{ oldText: 'read-through', newText: 'x' }] },
			baseline
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
			baseline
		);
		expect(preview.kind === 'note' && preview.change.problems[0]).toContain('appears 2 times');
	});

	it('says so when a save changes nothing a reader would notice', () => {
		const baseline = note();
		const preview = approvalPreview(
			'save_note',
			{ noteId: baseline.id, markdown: 'The cache is write-through.\n\nRevisit in Q3.' },
			baseline
		);
		expect(preview.kind === 'note' && preview.change.notices).toHaveLength(1);
	});

	it('falls back to argument summaries for a tool that is not a note change', () => {
		expect(approvalPreview('create_todo', { title: 'Renew certs' }, undefined)).toMatchObject({
			kind: 'arguments'
		});
	});

	it('waits for the current note rather than guessing a diff', () => {
		expect(
			approvalPreview('save_note', { noteId: crypto.randomUUID(), markdown: '# x' }, undefined)
		).toMatchObject({ kind: 'arguments' });
	});
});
