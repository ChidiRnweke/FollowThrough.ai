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

	it('matches Windows line endings without changing untouched endings', () => {
		const result = patch('a\r\nb\r\n', { oldText: 'a\nb', newText: 'c' });
		expect(result).toMatchObject({ ok: true, markdown: 'c\r\n' });
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

	it('suggests the closest text when an anchor is close but not a match', () => {
		const result = patch(body, { oldText: 'Ship the feature.', newText: 'x' });
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

describe('Tolerating a near-exact anchor', () => {
	it('tolerates padding whitespace around an otherwise exact anchor', () => {
		const result = patch(body, { oldText: '   Ship the thing.  ', newText: 'Ship it.' });
		expect(result).toMatchObject({ ok: true, appliedEdits: 1 });
	});

	it('tolerates internal whitespace drift in the anchor', () => {
		const result = patch('Ship  the thing.', { oldText: 'Ship the thing.', newText: 'Ship it.' });
		expect(result.ok && result.markdown).toBe('Ship it.');
	});

	it('tolerates typographic punctuation in the anchor', () => {
		const result = patch('Say \u201Chello\u201D.', { oldText: 'Say "hello".', newText: 'Done.' });
		expect(result.ok && result.markdown).toBe('Done.');
	});

	it('reports the actual text a tolerant match replaced', () => {
		const result = patch('Ship  the thing.', { oldText: 'Ship the thing.', newText: 'Ship it.' });
		expect(result.ok && result.matchedTexts).toEqual(['Ship  the thing.']);
	});

	it('rejects a tolerant match that is not unique', () => {
		const result = patch('a  b\na\tb\n', { oldText: 'a b', newText: 'x' });
		expect(result).toMatchObject({
			ok: false,
			failures: [{ reason: 'ambiguous', occurrences: 2 }]
		});
	});

	it('replaces every tolerant match when asked to', () => {
		const result = patch('a  b\na\tb\n', { oldText: 'a b', newText: 'x', replaceAll: true });
		expect(result.ok && result.markdown).toBe('x\nx\n');
	});

	it('does not fuzzy-match a similar but different anchor', () => {
		const result = patch(body, { oldText: 'Ships the thing', newText: 'x' });
		expect(result.ok === false && result.failures[0]).toMatchObject({ reason: 'not_found' });
	});
});

describe('Literal text and source preservation', () => {
	it.each(['$&', '$$', '$`', "$'"])('inserts %s literally in an exact replacement', (newText) => {
		expect(patch('before old after', { oldText: 'old', newText })).toMatchObject({
			ok: true,
			markdown: `before ${newText} after`
		});
	});
	it('preserves mixed endings and replacement bytes', () => {
		expect(patch('A\r\nold\nZ\r\n', { oldText: 'old', newText: 'new\r\nline' })).toMatchObject({
			ok: true,
			markdown: 'A\r\nnew\r\nline\nZ\r\n'
		});
	});
	it('counts anchors with different line endings as ambiguous', () => {
		expect(patch('a\nb / a\r\nb', { oldText: 'a\nb', newText: 'c' })).toMatchObject({
			ok: false,
			failures: [{ reason: 'ambiguous', occurrences: 2 }]
		});
	});
	it('replaces every line-ending equivalent span literally', () => {
		expect(
			patch('a\nb / a\r\nb\r\n', { oldText: 'a\nb', newText: '$&', replaceAll: true })
		).toMatchObject({ ok: true, markdown: '$& / $&\r\n' });
	});
	it('preserves surrounding bytes in a tolerant match', () => {
		expect(
			patch('A\r\nsmart “quote”\r\nZ', { oldText: 'smart "quote"', newText: '$$' })
		).toMatchObject({ ok: true, markdown: 'A\r\n$$\r\nZ' });
	});
});
