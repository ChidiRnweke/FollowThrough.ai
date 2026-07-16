import type { ActorContext, Note, ProjectId, ProvenanceId, RunAgentInput } from '$lib/models';
import type {
	AgentContextBuilder,
	KnowledgeSearcher,
	NoteReader,
	SkillFinder,
	RelevantSkillSelector,
	SkillUsageRecorder
} from '$lib/services';
import { KeywordRelevantSkillSelector } from '$lib/services';

const CONTEXT_NOTE_CONTENT_LIMIT = 4000;

export class EnrichedAgentContextBuilder implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
		private readonly knowledgeSearcher: KnowledgeSearcher,
		private readonly skillFinder: SkillFinder,
		private readonly noteReader: NoteReader,
		private readonly skillSelector: RelevantSkillSelector = new KeywordRelevantSkillSelector(),
		private readonly skillUsageRecorder?: SkillUsageRecorder
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
			this.skillFinder.listEnabled(actor, projectId),
			this.loadContextNotes(actor, input.contextNoteIds ?? [])
		]);
		const requested = new Set((input.requestedSkillNames ?? []).map((name) => name.toLowerCase()));
		const requestedNoteIds = new Set(input.requestedSkillNoteIds ?? []);
		const selected = await this.skillSelector.select(actor, input.prompt, availableSkills);
		const exposed = availableSkills.filter(
			(skill) =>
				selected.some((candidate) => candidate.noteId === skill.noteId) ||
				requestedNoteIds.has(skill.noteId) ||
				requested.has(skill.name.toLowerCase()) ||
				requested.has((skill.slug ?? '').toLowerCase())
		);
		const explicitlyLoaded = await Promise.all(
			exposed.map(async (summary) => {
				const isRequested =
					requestedNoteIds.has(summary.noteId) ||
					requested.has(summary.name.toLowerCase()) ||
					requested.has((summary.slug ?? '').toLowerCase());
				if (!isRequested) return { summary, isRequested };
				const skill = await this.skillFinder.load(actor, summary.noteId);
				await this.skillUsageRecorder?.record(actor, {
					skillNoteId: summary.noteId,
					contextNoteId: input.noteId,
					provenanceId: run.provenanceId
				});
				return { summary, isRequested, instructions: skill.note.plainText };
			})
		);
		const noteMatches = matches.filter((match) => match.document.memoryEntryId === undefined);
		const memoryMatches = matches.filter((match) => match.document.memoryEntryId !== undefined);
		return {
			...base,
			knowledge: noteMatches.map((match) => ({
				noteId: match.document.noteId,
				diagramId: match.document.diagramId,
				content: match.document.content,
				score: match.score
			})),
			memory: memoryMatches.map((match) => ({
				memoryEntryId: match.document.memoryEntryId,
				content: match.document.content,
				score: match.score
			})),
			contextNotes: contextNotes.map((note) => ({
				noteId: note.id,
				title: note.title,
				content: note.plainText.slice(0, CONTEXT_NOTE_CONTENT_LIMIT)
			})),
			skills: explicitlyLoaded.map(({ summary, isRequested, instructions }) => ({
				noteId: summary.noteId,
				name: summary.name,
				slug: summary.slug,
				description: summary.description,
				triggerHints: summary.triggerHints,
				requested: isRequested,
				...(instructions !== undefined ? { instructions } : {})
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
