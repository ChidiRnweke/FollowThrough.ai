import type { ActorContext, Note, ProjectId, ProvenanceId, RunAgentInput } from '$lib/models';
import type {
	AgentContextBuilder,
	NoteReader,
	SkillFinder,
	RelevantSkillSelector,
	SkillUsageRecorder
} from '$lib/services';
import { KeywordRelevantSkillSelector } from '$lib/services';

const CONTEXT_NOTE_CONTENT_LIMIT = 4000;

/**
 * Assembles the per-run agent context. Project knowledge is NOT front-loaded
 * here — the agent retrieves it on demand via the `search` and scoped memory
 * tools. This builder provides only explicitly attached context notes and
 * discoverable skill summaries.
 */
export class EnrichedAgentContextBuilder implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
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
		const [availableSkills, contextNotes] = await Promise.all([
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
		return {
			...base,
			contextNotes: contextNotes.map((note) => ({
				noteId: note.id,
				title: note.title,
				content: note.plainText.slice(0, CONTEXT_NOTE_CONTENT_LIMIT)
			})),
			skills: exposed.map((summary) => ({
				noteId: summary.noteId,
				name: summary.name,
				slug: summary.slug,
				description: summary.description,
				triggerHints: summary.triggerHints
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
