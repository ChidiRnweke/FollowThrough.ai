import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_MODEL } from './embeddings';

describe('embeddings', () => {
	it('has a stable default model', () => {
		expect(DEFAULT_EMBEDDING_MODEL).toBe('openai/text-embedding-3-large');
	});
});
