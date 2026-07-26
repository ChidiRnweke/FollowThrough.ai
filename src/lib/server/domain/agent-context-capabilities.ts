import type {
	ActorContext,
	ConversationId,
	Note,
	ProjectId,
	ProvenanceId,
	ResolvedAppContextV1,
	RunAgentInput,
	SkillSummary
} from '$lib/models';
import type {
	AgentContextBuilder,
	NoteReader,
	SkillFinder,
	SkillUsageRecorder,
	ConversationJournal,
	ProjectReader,
	MemoryEntryLister
} from '$lib/services';

const CONTEXT_NOTE_CONTENT_LIMIT = 4000;

/**
 * Every enabled skill's summary is advertised; the model is the classifier that
 * decides which instructions to load. This budget is a safety valve for
 * workspaces with hundreds of skills, not a relevance filter — anything cut is
 * still reachable through list_skills.
 */
const SKILL_CATALOG_BUDGET = 16000;

interface AdvertisedSkill {
	readonly noteId: string;
	readonly name: string;
	readonly slug?: string;
	readonly description: string;
	readonly triggerHints: readonly string[];
}

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
			skills: this.buildCatalog(availableSkills, (skill) =>
				this.isRequested(skill, requested, requestedNoteIds)
			)
		};
	}

	private isRequested(
		skill: SkillSummary,
		requestedNames: ReadonlySet<string>,
		requestedNoteIds: ReadonlySet<string>
	): boolean {
		return (
			requestedNoteIds.has(skill.noteId) ||
			requestedNames.has(skill.name.toLowerCase()) ||
			requestedNames.has((skill.slug ?? '').toLowerCase())
		);
	}

	/**
	 * Explicitly requested and pinned skills lead and are never dropped by the
	 * budget; the rest follow alphabetically so the catalogue is stable between
	 * runs.
	 */
	private buildCatalog(
		available: readonly SkillSummary[],
		isRequested: (skill: SkillSummary) => boolean
	): { items: readonly AdvertisedSkill[]; truncated?: true } {
		const eligible = available.filter(
			(skill) => skill.isEnabled && (skill.allowImplicitInvocation !== false || isRequested(skill))
		);
		const priority = (skill: SkillSummary): number =>
			isRequested(skill) ? 0 : skill.isPinned ? 1 : 2;
		const ordered = [...eligible].sort(
			(left, right) => priority(left) - priority(right) || left.name.localeCompare(right.name)
		);
		const items: AdvertisedSkill[] = [];
		let budget = 0;
		let truncated = false;
		for (const skill of ordered) {
			const advertised: AdvertisedSkill = {
				noteId: skill.noteId,
				name: skill.name,
				slug: skill.slug,
				description: skill.description,
				triggerHints: skill.triggerHints
			};
			const size = JSON.stringify(advertised).length;
			if (priority(skill) === 2 && budget + size > SKILL_CATALOG_BUDGET) {
				truncated = true;
				continue;
			}
			budget += size;
			items.push(advertised);
		}
		return truncated ? { items, truncated: true } : { items };
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
