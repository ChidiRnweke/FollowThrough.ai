import { expect, it } from 'vitest';
import { toolContentHash, toolEmbeddingText } from './tool-index';

it('uses concise discovery wording instead of the execution contract', () => {
	expect(
		toolEmbeddingText({
			name: 'edit_note',
			description: 'Long execution contract',
			retrievalText: 'change one sentence'
		})
	).toBe('edit_note: change one sentence');
});

it('ignores execution-only wording when the discovery text is unchanged', () => {
	const original = {
		name: 'edit_note',
		description: 'Old execution contract',
		retrievalText: 'change one sentence'
	};
	expect(toolContentHash({ ...original, description: 'Updated execution contract' })).toBe(
		toolContentHash(original)
	);
});
