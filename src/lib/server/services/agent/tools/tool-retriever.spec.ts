import { describe, expect, it } from 'vitest';
import { EmbeddedToolRetriever } from './tool-retriever';

describe('EmbeddedToolRetriever', () => {
	it('is available as a domain service', () => {
		expect(EmbeddedToolRetriever).toBeTypeOf('function');
	});
});
