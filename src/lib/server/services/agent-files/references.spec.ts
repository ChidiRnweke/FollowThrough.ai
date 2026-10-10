import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type { AttachmentId } from '$lib/models/attachments';
import { agentFileReferencesFixture } from '$lib/testing/agent/fixtures/file-references';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import {
	diagramBuilder,
	noteBuilder,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('describes real Markdown bytes, tokens, lines and checksum rather than cached plain text', () => {
	const note = noteBuilder({
		plainText: 'stale search text',
		document: {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Café', marks: [{ type: 'bold' }] }] }
			]
		}
	});
	const markdown = '**Café**';
	const path = `/projects/${note.projectId}/notes/${note.id}.md`;
	expect(agentFileReferencesFixture().describeNote(note)).toEqual({
		kind: 'file',
		id: createHash('sha256').update(path).digest('hex'),
		path,
		mediaType: 'text/markdown',
		byteSize: Buffer.byteLength(markdown, 'utf8'),
		tokenCount: testTokenizer.count(markdown),
		lineCount: 1,
		checksumSha256: createHash('sha256').update(markdown).digest('hex')
	});
});
it('keeps attachment text paths compatible', () => {
	const id = '00000000-0000-4000-8000-000000000002' as AttachmentId;
	expect(agentFileReferencesFixture().attachmentPath(testProjectId(), id)).toBe(
		`/projects/${testProjectId()}/attachments/${id}.txt`
	);
});
it('keeps Mermaid paths compatible', () => {
	const diagram = diagramBuilder();
	expect(agentFileReferencesFixture().diagramPath(diagram)).toBe(
		`/projects/${diagram.projectId}/diagrams/${diagram.id}.mmd`
	);
});
it('keeps draw.io paths compatible', () => {
	const diagram = {
		...diagramBuilder(),
		kind: 'drawio' as const,
		source: '<mxfile><diagram /></mxfile>',
		currentRevision: 1,
		publishedRevision: 1
	};
	expect(agentFileReferencesFixture().diagramPath(diagram)).toBe(
		`/projects/${diagram.projectId}/diagrams/${diagram.id}.drawio`
	);
});
