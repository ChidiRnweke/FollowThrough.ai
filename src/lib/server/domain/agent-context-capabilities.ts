import type { ActorContext, ProjectId, ProvenanceId, RunAgentInput } from '$lib/models';
import type {
	AgentContextBuilder,
	KnowledgeSearcher,
	RelevantSkillSelector,
	SkillFinder,
	SkillUsageRecorder
} from '$lib/services';

export class EnrichedAgentContextBuilder implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
		private readonly knowledgeSearcher: KnowledgeSearcher,
		private readonly skillFinder: SkillFinder,
		private readonly skillSelector: RelevantSkillSelector,
		private readonly skillUsageRecorder: SkillUsageRecorder
	) {}

	async build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId }
	): Promise<Readonly<Record<string, unknown>>> {
		const base = await this.base.build(actor, input, run);
		const projectId =
			input.projectId ??
			(typeof base.projectId === 'string' ? (base.projectId as ProjectId) : undefined);
		const [matches, availableSkills] = await Promise.all([
			projectId
				? this.knowledgeSearcher.search(actor, input.prompt, 8, projectId)
				: Promise.resolve([]),
			this.skillFinder.listEnabled(actor)
		]);
		const selected = await this.skillSelector.select(actor, input.prompt, availableSkills);
		const loaded = await Promise.all(
			selected.map((skill) => this.skillFinder.load(actor, skill.noteId))
		);
		const relevantSkills = projectId
			? loaded.filter((skill) => skill.note.projectId === projectId)
			: [];
		await Promise.all(
			relevantSkills.map((skill) =>
				this.skillUsageRecorder.record(actor, {
					skillNoteId: skill.note.id,
					contextNoteId: input.noteId,
					provenanceId: run.provenanceId
				})
			)
		);
		return {
			...base,
			knowledge: matches.map((match) => ({
				noteId: match.document.noteId,
				diagramId: match.document.diagramId,
				content: match.document.content,
				score: match.score
			})),
			skills: relevantSkills.map((skill) => ({
				noteId: skill.note.id,
				name: skill.name,
				description: skill.description,
				instructions: skill.note.plainText
			}))
		};
	}
}
