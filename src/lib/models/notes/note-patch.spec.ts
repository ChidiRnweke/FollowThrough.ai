import { describe, expect, it } from 'vitest';
import { applyNotePatch, type NoteEdit } from './index';

const body = '# Plan\n\nShip the thing.\n\nThen ship it again.\n';

const patch = (markdown: string, ...edits: NoteEdit[]) => applyNotePatch(markdown, edits);

describe('Applying a note patch', () => {
	it('replaces the anchored text', () => {
		const result = patch(body, { oldText: 'Ship the thing.', newText: 'Ship the feature.' });
		expect(result).toMatchObject({
			ok: true,
			markdown: expect.stringContaining('Ship the feature.')
		});
	});

	it('leaves the rest of the note byte-identical', () => {
		const result = patch(body, { oldText: 'Ship the thing.', newText: 'Ship the feature.' });
		expect(result.ok && result.markdown).toBe(
			'# Plan\n\nShip the feature.\n\nThen ship it again.\n'
		);
	});

	it('reports how many edits it applied', () => {
		const result = patch(
			body,
			{ oldText: '# Plan', newText: '# Roadmap' },
			{ oldText: 'Ship the thing.', newText: 'Ship it.' }
		);
		expect(result).toMatchObject({ ok: true, appliedEdits: 2 });
	});

	it('applies edits in order, so a later anchor can match earlier output', () => {
		const result = patch(
			body,
			{ oldText: 'Ship the thing.', newText: 'Draft the thing.' },
			{ oldText: 'Draft the thing.', newText: 'Draft the plan.' }
		);
		expect(result.ok && result.markdown).toContain('Draft the plan.');
	});

	it('normalises Windows line endings before matching', () => {
		const result = patch('a\r\nb\r\n', { oldText: 'a\nb', newText: 'c' });
		expect(result).toMatchObject({ ok: true, markdown: 'c\n' });
	});
});

describe('Rejecting a note patch', () => {
	it('rejects an empty anchor rather than inserting at the start', () => {
		expect(patch(body, { oldText: '', newText: 'x' })).toMatchObject({
			ok: false,
			failures: [{ reason: 'empty_anchor' }]
		});
	});

	it('rejects an edit that would change nothing', () => {
		expect(patch(body, { oldText: 'Ship the thing.', newText: 'Ship the thing.' })).toMatchObject({
			ok: false,
			failures: [{ reason: 'no_op' }]
		});
	});

	it('rejects an anchor that does not appear', () => {
		expect(patch(body, { oldText: 'Sail the thing.', newText: 'x' })).toMatchObject({
			ok: false,
			failures: [{ reason: 'not_found' }]
		});
	});

	it('suggests the closest text when an anchor is nearly right', () => {
		const result = patch(body, { oldText: '   Ship the thing.  ', newText: 'x' });
		expect(result.ok === false && result.failures[0]).toMatchObject({
			reason: 'not_found',
			nearest: 'Ship the thing.'
		});
	});

	it('rejects an anchor that appears more than once', () => {
		expect(patch('same\nsame\n', { oldText: 'same', newText: 'other' })).toMatchObject({
			ok: false,
			failures: [{ reason: 'ambiguous', occurrences: 2 }]
		});
	});

	it('replaces every occurrence when asked to', () => {
		expect(
			patch('same\nsame\n', { oldText: 'same', newText: 'other', replaceAll: true })
		).toMatchObject({ ok: true, markdown: 'other\nother\n' });
	});

	/**
	 * The caller saves the whole body, so a half-applied patch is a corrupted note
	 * rather than a failed one.
	 */
	it('applies nothing when a later edit fails', () => {
		const result = patch(
			body,
			{ oldText: '# Plan', newText: '# Roadmap' },
			{ oldText: 'missing', newText: 'x' }
		);
		expect(result.ok).toBe(false);
	});

	it('reports every failing edit, not just the first', () => {
		const result = patch(body, { oldText: 'missing', newText: 'x' }, { oldText: '', newText: 'y' });
		expect(result.ok === false && result.failures).toHaveLength(2);
	});

	it('identifies which edit failed', () => {
		const result = patch(
			body,
			{ oldText: '# Plan', newText: '# Roadmap' },
			{ oldText: 'missing', newText: 'x' }
		);
		expect(result.ok === false && result.failures[0]).toMatchObject({ editIndex: 1 });
	});
});
