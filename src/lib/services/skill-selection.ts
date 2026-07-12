import type { ActorContext, SkillSummary } from '../models';
import type { RelevantSkillSelector } from './agent';

const terms = (value: string): Set<string> =>
	new Set(
		value
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((term) => term.length > 2)
	);

export class KeywordRelevantSkillSelector implements RelevantSkillSelector {
	constructor(private readonly limit = 3) {}

	async select(
		_actor: ActorContext,
		prompt: string,
		skills: readonly SkillSummary[]
	): Promise<readonly SkillSummary[]> {
		void _actor;
		const promptTerms = terms(prompt);
		return skills
			.filter((skill) => skill.isEnabled)
			.map((skill) => ({
				skill,
				score: [
					...terms(`${skill.name} ${skill.description} ${skill.triggerHints.join(' ')}`)
				].filter((term) => promptTerms.has(term)).length
			}))
			.filter(({ score }) => score > 0)
			.sort(
				(left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name)
			)
			.slice(0, this.limit)
			.map(({ skill }) => skill);
	}
}
