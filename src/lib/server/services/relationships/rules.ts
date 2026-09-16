import type { RelationshipClassification } from '$lib/models/relationships';

export class RelationshipRules {
	async classify(sourceText: string, targetText: string): Promise<RelationshipClassification> {
		const sourceNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(sourceText);
		const targetNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(targetText);
		if (sourceNegates !== targetNegates)
			return {
				kind: 'contradicts',
				justification: 'The two passages express opposing constraints or recommendations.',
				confidence: 70
			};
		if (/\b(?:decided|decision|selected|chose|approved)\b/i.test(targetText))
			return {
				kind: 'prior_decision',
				justification:
					'The related passage records an earlier decision relevant to this selection.',
				confidence: 70
			};
		return {
			kind: 'mentions',
			justification: `Semantically related content: ${targetText.slice(0, 180)}`,
			confidence: 60
		};
	}
}
