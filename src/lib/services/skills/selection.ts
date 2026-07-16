import type { ActorContext, SkillSummary } from '$lib/models';
import type { RelevantSkillSelector } from './contracts';

const terms = (value: string): Set<string> =>
	new Set(
		value
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((term) => term.length > 2)
	);

export class KeywordRelevantSkillSelector implements RelevantSkillSelector {
	constructor(
		private readonly limit = 12,
		private readonly metadataBudget = 8000
	) {}

	async select(
		_actor: ActorContext,
		prompt: string,
		skills: readonly SkillSummary[]
	): Promise<readonly SkillSummary[]> {
		void _actor;
		const promptTerms = terms(prompt);
		let budget = 0;
		return skills
			.filter((skill) => skill.isEnabled)
			.filter((skill) => skill.allowImplicitInvocation !== false)
			.map((skill) => ({
				skill,
				score:
					(skill.isPinned ? 1000 : 0) +
					(prompt.toLowerCase().includes(skill.slug?.toLowerCase() ?? '\u0000') ? 50 : 0) +
					[...terms(`${skill.name} ${skill.description} ${skill.triggerHints.join(' ')}`)].filter(
						(term) => promptTerms.has(term)
					).length
			}))
			.filter(({ score }) => score > 0 || Boolean(score >= 1000))
			.sort(
				(left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name)
			)
			.slice(0, this.limit)
			.map(({ skill }) => skill)
			.filter((skill) => {
				const size = skill.name.length + skill.description.length + (skill.slug?.length ?? 0) + 32;
				if (budget + size > this.metadataBudget) return false;
				budget += size;
				return true;
			});
	}
}
