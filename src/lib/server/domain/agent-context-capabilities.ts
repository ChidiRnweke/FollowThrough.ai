import type {
	ActorContext,
	ConversationId,
	Note,
	ProjectId,
	ProvenanceId,
	ResolvedAppContextV1,
	RunAgentInput
} from '$lib/models';
import type {
	AgentContextBuilder,
	NoteReader,
	SkillFinder,
	RelevantSkillSelector,
	SkillUsageRecorder,
	ConversationJournal,
	ProjectReader,
	MemoryEntryLister
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
		private readonly skillUsageRecorder?: SkillUsageRecorder,
		private readonly conversations?: ConversationJournal,
		private readonly projects?: ProjectReader,
		private readonly memoryLister?: MemoryEntryLister
	) {}

	async build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId; conversationId?: ConversationId }
	): Promise<Readonly<Record<string, unknown>>> {
		const base = await this.base.build(actor, input, run);
		const projectId =
			input.projectId ??
			(typeof base.projectId === 'string' ? (base.projectId as ProjectId) : undefined);
		const [availableSkills, contextNotes, allMemories] = await Promise.all([
			this.skillFinder.listEnabled(actor, projectId),
			this.loadContextNotes(actor, input.contextNoteIds ?? []),
			this.memoryLister ? this.memoryLister.list(actor, {}) : Promise.resolve([])
		]);
		const userMemories = allMemories.filter((m) => m.shareWithAgents);
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
			...(await this.resolveAppContext(actor, input, run.conversationId)),
			...(userMemories.length > 0
				? { userMemory: userMemories.map((entry) => entry.content) }
				: {}),
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

	private async resolveAppContext(
		actor: ActorContext,
		input: RunAgentInput,
		conversationId?: ConversationId
	): Promise<{ appContext?: ResolvedAppContextV1 }> {
		if (!input.appContext) return {};
		const conversation = conversationId
			? await this.conversations?.get(actor, conversationId)
			: undefined;
		const originProjectId = conversation?.contextProjectId;
		const originProject = originProjectId
			? await this.projects?.get(actor, originProjectId).catch(() => undefined)
			: undefined;
		const currentProjectId =
			input.appContext.currentProject?.id ?? input.appContext.activeResource?.projectId;
		const projectTransition = !originProjectId
			? 'origin_unscoped'
			: !currentProjectId
				? 'screen_unscoped'
				: originProjectId === currentProjectId
					? 'same_project'
					: 'different_project';
		return {
			appContext: {
				...input.appContext,
				conversationOrigin: {
					...(originProjectId ? { projectId: originProjectId } : {}),
					...(originProject ? { projectName: originProject.name } : {}),
					...(conversation?.contextNoteId ? { noteId: conversation.contextNoteId } : {})
				},
				projectTransition
			}
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
