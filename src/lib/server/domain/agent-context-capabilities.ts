import type {
	ActorContext,
	Note,
	ProjectId,
	ProvenanceId,
	RunAgentInput,
	Skill
} from '$lib/models';
import type {
	AgentContextBuilder,
	KnowledgeSearcher,
	NoteReader,
	RelevantSkillSelector,
	SkillFinder,
	SkillUsageRecorder
} from '$lib/services';

const CONTEXT_NOTE_CONTENT_LIMIT = 4000;

export class EnrichedAgentContextBuilder implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
		private readonly knowledgeSearcher: KnowledgeSearcher,
		private readonly skillFinder: SkillFinder,
		private readonly skillSelector: RelevantSkillSelector,
		private readonly skillUsageRecorder: SkillUsageRecorder,
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
		const selected = await this.skillSelector.select(actor, input.prompt, availableSkills);
		const loaded = await Promise.all(
			selected.map((skill) => this.skillFinder.load(actor, skill.noteId))
		);
		// Explicitly requested skills bypass keyword matching and the project
		// filter — the user asked for them by name.
		const requested = await this.loadRequestedSkills(
			actor,
			input.requestedSkillNames ?? [],
			availableSkills
		);
		const keywordSkills = projectId
			? loaded.filter((skill) => skill.note.projectId === projectId)
			: [];
		const relevantSkills = [
			...requested,
			...keywordSkills.filter(
				(skill) => !requested.some((existing) => existing.note.id === skill.note.id)
			)
		];
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
			contextNotes: contextNotes.map((note) => ({
				noteId: note.id,
				title: note.title,
				content: note.plainText.slice(0, CONTEXT_NOTE_CONTENT_LIMIT)
			})),
			skills: relevantSkills.map((skill) => ({
				noteId: skill.note.id,
				name: skill.name,
				description: skill.description,
				instructions: skill.note.plainText
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

	private async loadRequestedSkills(
		actor: ActorContext,
		names: readonly string[],
		available: readonly { name: string; noteId: Note['id'] }[]
	): Promise<readonly Skill[]> {
		const summaries = names
			.map((name) => available.find((skill) => skill.name === name))
			.filter((skill): skill is (typeof available)[number] => skill !== undefined);
		return Promise.all(summaries.map((skill) => this.skillFinder.load(actor, skill.noteId)));
	}
}
