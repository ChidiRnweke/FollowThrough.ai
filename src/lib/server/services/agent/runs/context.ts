import type {
	AgentRunContext,
	BaseAgentContextData,
	ContextSelection,
	Conversation,
	ContextNote,
	ContextResource,
	ContextResourceText,
	ResolvedAgentAppContextV1,
	RunAgentInput,
	AppContextSnapshotV1
} from '$lib/models/agent';
import type { AttachmentView } from '$lib/models/attachments';
import type { Diagram } from '$lib/models/diagrams';
import type { MemoryEntry } from '$lib/models/memory';
import type { Widget } from '$lib/models/widgets';
import type { Note } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { SkillSummary } from '$lib/models/skills';
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export type CurrentContextNote =
	{ readonly kind: 'note'; readonly note: Note } | { readonly kind: 'no_current_note' };
export type ConversationContextProject =
	{ readonly kind: 'project'; readonly project: Project } | { readonly kind: 'no_origin_project' };
/**
 * A widget, diagram or file the user attached, as the controller loaded it. Diagrams and
 * files carry the path the agent file namespace mounts them at, so a resource too large to
 * inline still says exactly where to read it.
 */
export type AttachedResource =
	| { readonly kind: 'widget'; readonly widget: Widget }
	| { readonly kind: 'diagram'; readonly diagram: Diagram; readonly filePath: string }
	| { readonly kind: 'attachment'; readonly view: AttachmentView; readonly filePath: string };

export interface AgentContextValues {
	readonly base: BaseAgentContextData;
	readonly skills: readonly SkillSummary[];
	readonly contextNotes: readonly Note[];
	readonly contextResources: readonly AttachedResource[];
	readonly profileMemory: readonly MemoryEntry[];
	readonly appContext?: ResolvedAgentAppContextV1;
}

/**
 * Token counting for attached context notes: at or under the limit the full
 * content rides inside the user message; larger notes carry no content and the
 * prompt assembly points the model at get_note and sed for them instead.
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

const contextTextOf = (text: string): ContextResourceText => {
	const tokenCount = encoding().encode(text).length;
	return tokenCount <= contextNoteTokenLimit()
		? { inclusion: 'inline', text, tokenCount }
		: { inclusion: 'too_large', tokenCount };
};

/**
 * What of each resource the model reads inline. A widget is its whole definition — the
 * read_widget payload — because its layout and data are the widget. A draw.io diagram is its
 * labels: the XML is mostly geometry, and stays one sed call away at its file path. Mermaid
 * source is already the readable form. A file is its extracted text.
 */
const contextResourceOf = (resource: AttachedResource): ContextResource => {
	switch (resource.kind) {
		case 'widget': {
			const { widget } = resource;
			return {
				kind: 'widget',
				widgetId: widget.id,
				title: widget.title,
				text: contextTextOf(JSON.stringify({ layout: widget.layout, data: widget.data }, null, 2))
			};
		}
		case 'diagram': {
			const { diagram } = resource;
			return {
				kind: 'diagram',
				diagramId: diagram.id,
				diagramKind: diagram.kind,
				title: diagram.title || 'Untitled diagram',
				filePath: resource.filePath,
				text: contextTextOf(diagram.kind === 'mermaid' ? diagram.source : diagram.searchableText)
			};
		}
		case 'attachment': {
			const { attachment, version } = resource.view;
			return {
				kind: 'attachment',
				attachmentId: attachment.id,
				name: attachment.path,
				content:
					version.extractedText === undefined
						? { kind: 'not_extracted', processingStatus: version.processingStatus }
						: {
								kind: 'extracted',
								filePath: resource.filePath,
								text: contextTextOf(version.extractedText)
							}
			};
		}
	}
};

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
			contextResources: values.contextResources.map(contextResourceOf),
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
			requestedNames.has(skill.slug.toLowerCase())
		);
	}

	/**
	 * Explicitly requested and pinned skills lead; all other eligible skills
	 * follow alphabetically so the catalogue is stable between
	 * runs.
	 */
	private buildCatalog(
		available: readonly SkillSummary[],
		isRequested: (skill: SkillSummary) => boolean
	): { items: readonly AdvertisedSkill[] } {
		const eligible = available.filter(
			(skill) => skill.isEnabled && (skill.allowImplicitInvocation || isRequested(skill))
		);
		const priority = (skill: SkillSummary): number =>
			isRequested(skill) ? 0 : skill.isPinned ? 1 : 2;
		const ordered = [...eligible].sort(
			(left, right) => priority(left) - priority(right) || left.name.localeCompare(right.name)
		);
		const items: AdvertisedSkill[] = [];
		for (const skill of ordered) {
			const advertised: AdvertisedSkill = {
				noteId: skill.noteId,
				name: skill.name,
				description: skill.description
			};
			items.push(advertised);
		}
		return { items };
	}
}
