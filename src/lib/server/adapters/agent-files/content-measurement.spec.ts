import { expect, it } from 'vitest';
import { AgentFileContentMeter } from './content-measurement';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
it('measures an empty stored payload without assigning a virtual identifier', () => {
	expect(new AgentFileContentMeter(testTokenizer).measure('')).toEqual({
		byteSize: 0,
		tokenCount: 0,
		lineCount: 0,
		checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
	});
});
