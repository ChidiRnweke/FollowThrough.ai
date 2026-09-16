import type {
	AgentRunContext,
	BaseAgentContextData,
	ContextSelection,
	Conversation,
	ContextNote,
	ResolvedAgentAppContextV1,
	RunAgentInput,
	AppContextSnapshotV1
} from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { SkillSummary } from '$lib/models/skills';
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export type CurrentContextNote =
	{ readonly kind: 'note'; readonly note: Note } | { readonly kind: 'no_current_note' };
export type ConversationContextProject =
	{ readonly kind: 'project'; readonly project: Project } | { readonly kind: 'no_origin_project' };
export interface AgentContextValues {
	readonly base: BaseAgentContextData;
	readonly skills: readonly SkillSummary[];
	readonly contextNotes: readonly Note[];
	readonly profileMemory: readonly MemoryEntry[];
	readonly appContext?: ResolvedAgentAppContextV1;
}

/**
 * Token counting for attached context notes: at or under the limit the full
 * content rides inside the user message; larger notes carry no content and the
 * prompt assembly points the model at search_note for them instead.
 */
let sharedEncoding: Tiktoken | undefined;
const encoding = (): Tiktoken => (sharedEncoding ??= getEncoding('cl100k_base'));

const contextNoteTokenLimit = (): number => {
	const raw = Number(process.env.CONTEXT_NOTE_TOKEN_LIMIT ?? '4000');
	return Number.isInteger(raw) && raw > 0 ? raw : 4000;
};

const contextNoteOf = (note: Note): ContextNote => {
	const tokenCount = encoding().encode(note.plainText).length;
	return {
		noteId: note.id,
		title: note.title,
		...(tokenCount <= contextNoteTokenLimit() ? { content: note.plainText } : {}),
		tokenCount
	};
};

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

/** Formats resolved resources for a run. Controllers own every resource read. */
export class AgentContext {
	base(
		input: Pick<RunAgentInput, 'projectId' | 'selection' | 'selections'>,
		current: CurrentContextNote
	): BaseAgentContextData {
		const note = current.kind === 'note' ? current.note : undefined;
		// One shape for the prompt to read, whichever field the request arrived with. The
		// singular `selection` is deliberately not emitted alongside it: it exists on the input
		// so the selection-bound tools can be offered, and repeating the excerpt here would put
		// the same passage in front of the model twice.
		const pinned = input.selections ?? (input.selection ? [input.selection] : []);
		// Titled only from the note this run already loaded, which is the note the passages
		// almost always came from. Reading a note apiece to name the rest would buy a label the
		// model can fetch itself.
		const selections: ContextSelection[] = pinned.map((selection) =>
			note && selection.noteId === note.id ? { ...selection, title: note.title } : selection
		);
		const projectId = input.projectId ?? note?.projectId;
		return {
			...(projectId ? { projectId } : {}),
			...(note ? { noteId: note.id } : {}),
			...(note ? { noteTitle: note.title } : {}),
			...(selections.length ? { selections } : {})
		};
	}

	build(input: RunAgentInput, values: AgentContextValues): AgentRunContext {
		const userMemories = values.profileMemory.filter((entry) => entry.shareWithAgents);
		const requested = new Set((input.requestedSkillNames ?? []).map((name) => name.toLowerCase()));
		const requestedNoteIds = new Set(input.requestedSkillNoteIds ?? []);
		return {
			...values.base,
			...(values.appContext ? { appContext: values.appContext } : {}),
			...(userMemories.length ? { userMemory: userMemories.map((entry) => entry.content) } : {}),
			contextNotes: values.contextNotes.map(contextNoteOf),
			skills: this.buildCatalog(values.skills, (skill) =>
				this.isRequested(skill, requested, requestedNoteIds)
			)
		};
	}

	appContext(
		snapshot: AppContextSnapshotV1,
		conversation: Conversation,
		origin: ConversationContextProject
	): ResolvedAgentAppContextV1 {
		const currentProjectId = snapshot.currentProject?.id ?? snapshot.activeResource?.projectId;
		const projectTransition =
			origin.kind === 'no_origin_project'
				? 'origin_unscoped'
				: !currentProjectId
					? 'screen_unscoped'
					: origin.project.id === currentProjectId
						? 'same_project'
						: 'different_project';
		return {
			...snapshot,
			conversationOrigin: {
				...(origin.kind === 'project'
					? { projectId: origin.project.id, projectName: origin.project.name }
					: {}),
				...(conversation.contextNoteId ? { noteId: conversation.contextNoteId } : {})
			},
			projectTransition
		};
	}

	requestedScope(
		snapshot: AppContextSnapshotV1,
		resolved: { readonly project?: Project; readonly note?: Note }
	): NonNullable<ResolvedAgentAppContextV1['requestedScope']> {
		const staged = [
			resolved.note ? 'note "' + resolved.note.title + '"' : undefined,
			resolved.project ? 'project "' + resolved.project.name + '"' : undefined
		].filter((part): part is string => part !== undefined);
		const current = snapshot.currentProject?.name
			? 'project "' + snapshot.currentProject.name + '"'
			: 'the ' + snapshot.surface.kind + ' screen';
		return {
			...(resolved.project
				? { projectId: resolved.project.id, projectName: resolved.project.name }
				: {}),
			...(resolved.note ? { noteId: resolved.note.id, noteTitle: resolved.note.title } : {}),
			note:
				'The user is now on ' +
				current +
				', but staged this request from ' +
				staged.join(' in ') +
				'. The current screen is the active scope; act on the staged target only if the request plainly refers to it, and say which one you used when it is ambiguous.'
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
}
