import { describe, expect, it } from 'vitest';
import { toolSummary } from './tool-summary';

describe('tool summary', () => {
	it('drops the model-facing mutation marker and keeps every other description intact', () => {
		expect({
			mutation: toolSummary(
				'Mutating tool. Permanently delete a note that is already in the trash.'
			),
			read: toolSummary('Read a note.')
		}).toEqual({
			mutation: 'Permanently delete a note that is already in the trash.',
			read: 'Read a note.'
		});
	});
});
