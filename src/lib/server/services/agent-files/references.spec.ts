import { expect, it } from 'vitest';
import type { AttachmentId } from '$lib/models/attachments';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import {
	diagramBuilder,
	noteBuilder,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentFileReferenceService } from './virtual-files';

const references = () => new AgentFileReferenceService(testTokenizer);

it('describes real Markdown bytes, tokens, lines and checksum', () => {
	expect(references().noteMetadata(noteBuilder(), '**Café**')).toEqual({
		kind: 'file',
		id: '012414f76456e6138da6b963e0984c936f9f1f4aaa66dce4409947f7f045c613',
		path: '/projects/00000000-0000-4000-8002-000000000001/notes/00000000-0000-4000-8003-000000000001.md',
		mediaType: 'text/markdown',
		byteSize: 9,
		tokenCount: 5,
		lineCount: 1,
		checksumSha256: '6c95d8234688edaaad07f4b63d344da74d15fbed3e93e602c3135a64b0260465'
	});
});
it('keeps attachment text paths compatible', () => {
	const id = '00000000-0000-4000-8000-000000000002' as AttachmentId;
	expect(references().attachmentPath(testProjectId(), id)).toBe(
		`/projects/${testProjectId()}/attachments/${id}.txt`
	);
});
it('keeps Mermaid paths compatible', () => {
	const diagram = diagramBuilder();
	expect(references().diagramPath(diagram)).toBe(
		`/projects/${diagram.projectId}/diagrams/${diagram.id}.mmd`
	);
});
it('keeps draw.io paths compatible', () => {
	const diagram = { ...diagramBuilder(), kind: 'drawio' as const };
	expect(references().diagramPath(diagram)).toBe(
		`/projects/${diagram.projectId}/diagrams/${diagram.id}.drawio`
	);
});
