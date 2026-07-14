import type { ActorContext, Note, ProjectId, ProvenanceId, RunAgentInput } from '$lib/models';
import type {
	AgentContextBuilder,
	KnowledgeSearcher,
	NoteReader,
	SkillFinder
} from '$lib/services';

const CONTEXT_NOTE_CONTENT_LIMIT = 4000;

export class EnrichedAgentContextBuilder implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
		private readonly knowledgeSearcher: KnowledgeSearcher,
		private readonly skillFinder: SkillFinder,
		private readonly noteReader: NoteReader
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
		const [matches, availableSkills, contextNotes] = await Promise.all([
			projectId
				? this.knowledgeSearcher.search(actor, input.prompt, 8, projectId)
				: Promise.resolve([]),
			this.skillFinder.listEnabled(actor),
			this.loadContextNotes(actor, input.contextNoteIds ?? [])
		]);
		const requested = new Set(input.requestedSkillNames ?? []);
		return {
			...base,
			knowledge: matches.map((match) => ({
				noteId: match.document.noteId,
				diagramId: match.document.diagramId,
				content: match.document.content,
				score: match.score
			})),
			contextNotes: contextNotes.map((note) => ({
				noteId: note.id,
				title: note.title,
				content: note.plainText.slice(0, CONTEXT_NOTE_CONTENT_LIMIT)
			})),
			skills: availableSkills.map((skill) => ({
				noteId: skill.noteId,
				name: skill.name,
				description: skill.description,
				triggerHints: skill.triggerHints,
				requested: requested.has(skill.name)
			}))
		};
	}

	private async loadContextNotes(
		actor: ActorContext,
		noteIds: readonly Note['id'][]
	): Promise<readonly Note[]> {
		const results = await Promise.all(
			noteIds.map((noteId) => this.noteReader.get(actor, noteId).catch(() => undefined))
		);
		return results.filter((note): note is Note => note !== undefined);
	}
}
