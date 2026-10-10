import { expect, it } from 'vitest';
import { ToolResultBoundary } from './read-tool';
it('rejects an unrepresentable result instead of producing empty success', () => {
	expect(() => new ToolResultBoundary().read(new Date('2026-10-02'))).toThrow(
		'Tool output could not be represented as JSON'
	);
});
