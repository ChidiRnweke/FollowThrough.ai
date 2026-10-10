import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { expect, it } from 'vitest';
import { AgentFileMetadataService } from './metadata';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
it('measures UTF-8 text and its trailing empty line exactly', () => {
	expect(
		new AgentFileMetadataService(new AgentFileContentMeter(testTokenizer)).file(
			'/unicode.txt',
			'text/plain',
			'é\n'
		)
	).toEqual({
		metadata: {
			kind: 'file',
			path: '/unicode.txt',
			mediaType: 'text/plain',
			id: '11fce1b9807fbdcb9ed4af6f913bbe4c92a17ee14ab0c7e6c939ac43ba51bd7f',
			checksumSha256: 'edd3a863872a04239eb29ad4bc12fc892b3d4ae57cc7e786a3697816f8e141c2',
			byteSize: 3,
			tokenCount: 2,
			lineCount: 2
		},
		content: 'é\n'
	});
});

it.each([
	{ kind: 'mermaid' as const, source: 'graph TD; A-->B', mediaType: 'text/vnd.mermaid' },
	{ kind: 'drawio' as const, source: '<mxfile/>', mediaType: 'application/vnd.jgraph.mxfile+xml' }
])('materializes $kind source with its exact language metadata', ({ kind, source, mediaType }) => {
	expect(
		new AgentFileMetadataService(new AgentFileContentMeter(testTokenizer)).diagram('/diagram', {
			kind,
			source
		})
	).toMatchObject({ content: source, metadata: { path: '/diagram', mediaType, lineCount: 1 } });
});
