import { describe, expect, it } from 'vitest';
import { drawioReferencesIn } from './index';

describe('note diagram references', () => {
	it('finds nested diagram references in document order', () => {
		expect(
			drawioReferencesIn([
				{
					document: {
						type: 'doc',
						content: [
							{ type: 'blockquote', content: [{ type: 'drawio', attrs: { diagramId: 'first' } }] },
							{ type: 'drawio', attrs: { diagramId: 'second' } }
						]
					}
				}
			])
		).toEqual(['first', 'second']);
	});
	it('counts a repeated diagram once across the selected documents', () => {
		expect(
			drawioReferencesIn([
				{ document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'same' } }] } },
				{ document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'same' } }] } }
			])
		).toEqual(['same']);
	});
	it('ignores empty references retained in a document', () => {
		expect(
			drawioReferencesIn([
				{
					document: {
						type: 'doc',
						content: [{ type: 'drawio' }, { type: 'drawio', attrs: { diagramId: null } }]
					}
				}
			])
		).toEqual([]);
	});
});
