import { describe, expect, it } from 'vitest';
import { readProseMirrorDocument } from '$lib/models/notes';
import { editableProseMirrorDocument } from './editor-content';

describe('editable document recovery', () => {
	it('preserves readable siblings and exposes an unsupported block as copyable JSON', () => {
		const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Keep this' }] };
		const futureBlock = { type: 'futureBlock', attrs: { value: 'Recover this' } };
		const document = readProseMirrorDocument({ type: 'doc', content: [paragraph, futureBlock] });

		expect(editableProseMirrorDocument(document).content).toEqual([
			paragraph,
			{
				type: 'codeBlock',
				attrs: { language: 'json' },
				content: [{ type: 'text', text: JSON.stringify(futureBlock, null, '\t') }]
			}
		]);
	});

	it('keeps a malformed stored document visible instead of opening an empty note', () => {
		const raw = { damaged: true, content: 'Recover the original document' };

		expect(editableProseMirrorDocument(readProseMirrorDocument(raw))).toEqual({
			type: 'doc',
			content: [
				{
					type: 'codeBlock',
					attrs: { language: 'json' },
					content: [{ type: 'text', text: JSON.stringify(raw, null, '\t') }]
				}
			]
		});
	});
});
