import { describe, expect, it } from 'vitest';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { readProseMirrorDocument } from '$lib/models/notes';
import { agentPayloadObjectSchema } from '$lib/models/agent/payload';
import { noteRecordSchema } from './index';

describe('cached record boundaries', () => {
	it('preserves an explicitly unreadable block across repeated cache reads', () => {
		const note = {
			...noteBuilder(),
			document: readProseMirrorDocument({
				type: 'doc',
				content: [{ type: 'future-block', text: 'Keep this content' }]
			})
		};
		expect(noteRecordSchema.parse(noteRecordSchema.parse(note)).document).toEqual(note.document);
	});

	it('does not turn an invalid agent payload into an empty cached object', () => {
		expect(agentPayloadObjectSchema.safeParse(new Date()).success).toBe(false);
	});
});
