import { describe, expect, it } from 'vitest';
import { referenceArchitectureUpdateApplied } from './memory';

const updatedSections = (content: string) =>
	Array.from({ length: 12 }, (_, index) => `## Section ${index + 2}\n\n${content}`).join('\n\n');

describe('embedded memory task outcome', () => {
	it('requires substantive requested sections grounded in the stated knowledge-layer standard', () => {
		expect({
			valid: referenceArchitectureUpdateApplied(
				updatedSections(
					'The knowledge layer sets the gold standard for depth and breadth in reference docs, so each section links decisions to durable evidence.'
				)
			),
			empty: referenceArchitectureUpdateApplied(updatedSections('')),
			unrelated: referenceArchitectureUpdateApplied(
				updatedSections(
					'This section describes an unrelated interface color palette and its spacing scale.'
				)
			)
		}).toEqual({ valid: true, empty: false, unrelated: false });
	});
});
