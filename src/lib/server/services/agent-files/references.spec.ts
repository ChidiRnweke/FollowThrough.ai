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

it('returns a note within the body budget inline, with its real Markdown metrics', () => {
	expect(references().noteBody(noteBuilder(), '**Café**')).toEqual({
		kind: 'inline',
		file: {
			kind: 'file',
			id: '012414f76456e6138da6b963e0984c936f9f1f4aaa66dce4409947f7f045c613',
			path: '/projects/00000000-0000-4000-8002-000000000001/notes/00000000-0000-4000-8003-000000000001.md',
			mediaType: 'text/markdown',
			byteSize: 9,
			tokenCount: 5,
			lineCount: 1,
			checksumSha256: '6c95d8234688edaaad07f4b63d344da74d15fbed3e93e602c3135a64b0260465'
		},
		content: '**Café**'
	});
});
it('returns the first page of a long note on whole lines, with the sed call that continues it', () => {
	// 400 lines of " word" repeated: each line is 50 cl100k tokens, so 1,000 tokens hold 19 lines
	// once the joining newlines are counted.
	const line = ' word'.repeat(50);
	const body = references().noteBody(
		noteBuilder(),
		Array.from({ length: 400 }, () => line).join('\n')
	);
	expect(body.kind === 'paged' ? { endLine: body.endLine, next: body.nextActions } : body).toEqual({
		endLine: 19,
		next: [
			{
				reason: 'Continue at the next unread line; 381 lines remain.',
				tool: 'sed',
				arguments: {
					path: '/projects/00000000-0000-4000-8002-000000000001/notes/00000000-0000-4000-8003-000000000001.md',
					range: { kind: 'to_end', startLine: 20 }
				}
			}
		]
	});
});
it('returns only the descriptor when not even the first line fits the body budget', () => {
	const body = references().noteBody(noteBuilder(), ' word'.repeat(1500));
	expect({
		kind: body.kind,
		next: body.kind === 'file' ? body.nextActions[0]?.arguments : null
	}).toEqual({
		kind: 'file',
		next: {
			path: '/projects/00000000-0000-4000-8002-000000000001/notes/00000000-0000-4000-8003-000000000001.md',
			range: { kind: 'to_end', startLine: 1 }
		}
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
