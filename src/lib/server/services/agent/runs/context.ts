import type { ActorContext } from '$lib/models/identity';
import type { Conversation, ConversationId, RunAgentInput } from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note, NoteId } from '$lib/models/notes';
import type { Project, ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ResolvedAppContextV1 } from '$lib/models/workspace';
import type { SkillSummary } from '$lib/models/skills';
interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId; conversationId?: ConversationId }
	): Promise<Readonly<Record<string, unknown>>>;
}
interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}
interface SkillFinder {
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
}
interface ConversationReader {
	get(actor: ActorContext, conversationId: ConversationId): Promise<Conversation>;
}
interface ProjectReader {
	get(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}
interface MemoryLister {
	list(
		actor: ActorContext,
		filter: Readonly<Record<string, unknown>>
	): Promise<readonly MemoryEntry[]>;
}

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
	readonly description: string;
}

/**
 * Assembles the per-run agent context. Project knowledge is NOT front-loaded
 * here — the agent retrieves it on demand via the `search` and scoped memory
 * tools. This builder provides only explicitly attached context notes and
 * discoverable skill summaries.
 */
export class AgentContext implements AgentContextBuilder {
	constructor(
		private readonly base: AgentContextBuilder,
		private readonly skillFinder: SkillFinder,
		private readonly noteReader: NoteReader,
		private readonly conversations?: ConversationReader,
		private readonly projects?: ProjectReader,
		private readonly memoryLister?: MemoryLister
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
				content: note.plainText
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
				description: skill.description
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
				projectTransition,
				...(await this.resolveRequestedScope(actor, input))
			}
		};
	}

	/**
	 * The staged scope only survives here when the live snapshot overrode it, so
	 * its presence already means "the user has moved on". Names are resolved so
	 * the agent can name both sides to the user instead of echoing ids.
	 */
	private async resolveRequestedScope(
		actor: ActorContext,
		input: RunAgentInput
	): Promise<Pick<ResolvedAppContextV1, 'requestedScope'>> {
		const requested = input.requestedScope;
		if (!requested) return {};
		const [project, note] = await Promise.all([
			requested.projectId
				? this.projects?.get(actor, requested.projectId).catch(() => undefined)
				: undefined,
			requested.noteId
				? this.noteReader.get(actor, requested.noteId).catch(() => undefined)
				: undefined
		]);
		const staged = [
			note ? `note "${note.title}"` : requested.noteId ? 'another note' : undefined,
			project ? `project "${project.name}"` : requested.projectId ? 'another project' : undefined
		].filter((part): part is string => part !== undefined);
		const current = input.appContext?.currentProject?.name
			? `project "${input.appContext.currentProject.name}"`
			: `the ${input.appContext?.surface.kind ?? 'unknown'} screen`;
		return {
			requestedScope: {
				...(requested.projectId ? { projectId: requested.projectId } : {}),
				...(project ? { projectName: project.name } : {}),
				...(requested.noteId ? { noteId: requested.noteId } : {}),
				...(note ? { noteTitle: note.title } : {}),
				note: `The user is now on ${current}, but staged this request from ${staged.join(' in ')}. The current screen is the active scope; act on the staged target only if the request plainly refers to it, and say which one you used when it is ambiguous.`
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
