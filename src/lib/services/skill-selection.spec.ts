import { describe, expect, it } from 'vitest';
import type { SkillSummary } from '$lib/models';
import { testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';
import { KeywordRelevantSkillSelector } from './skill-selection';

const skill = (overrides: Partial<SkillSummary> = {}): SkillSummary => ({
	noteId: testNoteId(),
	name: 'Decision records',
	description: 'Capture architecture decisions and their consequences',
	triggerHints: ['decision', 'ADR'],
	isEnabled: true,
	...overrides
});

describe('Skill selection invariants', () => {
	it('selects a skill whose domain terms match the prompt', async () => {
		const selected = await new KeywordRelevantSkillSelector().select(
			testActor(),
			'Create an architecture decision record',
			[skill()]
		);
		expect(selected.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('does not select disabled skills', async () => {
		const selected = await new KeywordRelevantSkillSelector().select(
			testActor(),
			'Create a decision record',
			[skill({ isEnabled: false })]
		);
		expect(selected).toEqual([]);
	});

	it('does not inject unrelated skills', async () => {
		const selected = await new KeywordRelevantSkillSelector().select(
			testActor(),
			'Find a deployment diagram',
			[skill()]
		);
		expect(selected).toEqual([]);
	});
});
