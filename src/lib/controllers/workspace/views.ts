import type { BacklinkPresentation } from '$lib/services/relationships/presentation';
import type { ReferencePresentation } from '$lib/services/references/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { ProvenancePresentation } from '$lib/services/provenance/presentation';
import type { TodayPresentation } from '$lib/services/workspace/today';
import type { ISuggestionPresentationService } from '$lib/services/suggestions/presentation';
import type { ShellContext, TodayView, NoteView } from '$lib/models/workspace-views';
import type { Project } from '$lib/models/projects';
import type { Note } from '$lib/models/notes';
import type { WorkspaceViewState } from '$lib/models/workspace-views';
import type { TodoPresentation } from '$lib/services/todos/presentation';
import type { ProjectTreePresentation } from '$lib/services/projects/presentation';
import type { NotePresentation } from '$lib/services/notes/presentation';

import { TOOL_DESCRIPTIONS, LOCKED_TOOL_NAMES } from '$lib/models/agent/tool-catalog';
import type { UserId } from '$lib/models/identity';
import type {
	ToolPreference,
	AgentPreferenceValues,
	Conversation,
	ConversationId,
	StoredMessage
} from '$lib/models/agent';
import type { ArtifactView } from '$lib/models/deliverables';
import type { Diagram } from '$lib/models/diagrams';
import type { Widget } from '$lib/models/widgets';
import type { TrashedNote } from '$lib/models/notes';
import type { AttachmentView } from '$lib/models/attachments';
import type { MemoryEntry } from '$lib/models/memory';
import type { MemorySuggestionView } from '$lib/models/suggestions';
import {
	type WorkspaceRecord,
	type WorkspaceValues,
	type WorkspaceRecordOf
} from '$lib/models/workspace-records';

import type { LocalDate } from '$lib/models/workspace';
import type { Todo, TodoListFilter, TodoView } from '$lib/models/todos';
import type { ProjectId, ProjectView } from '$lib/models/projects';
import { type NoteId } from '$lib/models/notes';
import type { NoteSectionNumbering } from '$lib/services/notes/section-numbering';

import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SkillSummary } from '$lib/models/skills';
import type { WorkspaceSkill } from '$lib/models/workspace-views';

import type { IMemoryPresentationService } from '$lib/services/memory/presentation';

/** Coordinates feature views from the normalized records, including local write overlays. */
export interface WorkspaceViewsController {
	all<K extends WorkspaceRecord['type']>(type: K): WorkspaceValues[K][];
	get<K extends WorkspaceRecord['type']>(
		type: K,
		...id: [string, ...string[]]
	): WorkspaceValues[K] | undefined;
	readonly projects: readonly Project[];
	readonly notes: readonly Note[];
	conversations(query?: string): readonly Conversation[];
	conversation(id: ConversationId): Conversation | null;
	messages(id: ConversationId): readonly StoredMessage[];
	latestRun(id: ConversationId): WorkspaceValues['agent_runs'] | null;
	skill(noteId: NoteId): WorkspaceSkill | null;
	skills(projectId?: ProjectId): readonly SkillSummary[];
	shell(userId: string): ShellContext | null;
	memories(projectId?: ProjectId): readonly MemoryEntry[];
	memorySuggestions(projectId?: ProjectId): readonly MemorySuggestionView[];
	attachments(owner: { kind: 'project' | 'note'; id: string }): readonly AttachmentView[];
	mentionableResources(
		query: string,
		projectId?: ProjectId
	): {
		readonly widgets: readonly Widget[];
		readonly diagrams: readonly Diagram[];
		readonly attachments: readonly AttachmentView[];
	};
	trashedNotes(projectId?: ProjectId): readonly TrashedNote[];
	trashedDiagrams(projectId?: ProjectId): readonly Diagram[];
	widget(widgetId: string): Widget | null;
	widgets(projectId: ProjectId, query?: string): readonly Widget[];
	trashedWidgets(projectId?: ProjectId): readonly Widget[];
	diagram(diagramId: string): Diagram | null;
	diagrams(projectId: ProjectId, query?: string): readonly Diagram[];
	artifacts(projectId: ProjectId, query?: string): readonly ArtifactView[];
	capabilityCounts(
		projectId?: ProjectId
	): Record<'memory' | 'notes' | 'todos' | 'attachments', number>;
	agentPreferences(userId: UserId): AgentPreferenceValues;
	toolPreferences(userId: string, projectId?: ProjectId): readonly ToolPreference[];
	project(projectId: ProjectId): ProjectView | null;
	note(
		noteId: NoteId
	): { readonly view: NoteView; readonly missing: readonly WorkspaceResourceIdentity[] } | null;
	todo(todo: Todo): TodoView | null;
	todos(filter?: TodoListFilter): readonly TodoView[];
	readonly categories: readonly string[];
	today(today: LocalDate): TodayView;
}

export class WorkspaceViews implements WorkspaceViewsController {
	constructor(
		private readonly backlinkPresentation: BacklinkPresentation,
		private readonly referencePresentation: ReferencePresentation,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly provenancePresentation: ProvenancePresentation,
		private readonly todayPresentation: TodayPresentation,
		private readonly todoPresentation: TodoPresentation,
		private readonly state: WorkspaceViewState,
		private readonly suggestionPresentation: ISuggestionPresentationService,
		private readonly memoryPresentation: IMemoryPresentationService,
		private readonly projectPresentation: ProjectTreePresentation,
		private readonly notePresentation: NotePresentation,
		private readonly sections: NoteSectionNumbering
	) {}
	private get records() {
		return this.state.records;
	}
	private get byType() {
		return this.state.byType;
	}

	all<K extends WorkspaceRecord['type']>(type: K): WorkspaceValues[K][] {
		return (this.byType.get(type) ?? [])
			.filter((record): record is WorkspaceRecordOf<K> => record.type === type)
			.map((record) => record.value);
	}
	get<K extends WorkspaceRecord['type']>(
		type: K,
		...id: [string, ...string[]]
	): WorkspaceValues[K] | undefined {
		const record = this.records.get(JSON.stringify([type, ...id]));
		if (!record || !this.workspaceCommandRules.isWorkspaceRecord(record, type)) return undefined;
		return record.value;
	}
	get projects(): readonly Project[] {
		return this.all('projects')
			.filter((project) => !project.archivedAt)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}
	get notes(): readonly Note[] {
		const projects = new Set(this.projects.map((project) => project.id));
		return this.all('notes')
			.filter((note) => !note.archivedAt && projects.has(note.projectId))
			.sort(
				(a, b) =>
					a.position - b.position ||
					a.createdAt.localeCompare(b.createdAt) ||
					a.id.localeCompare(b.id)
			);
	}
	conversations(query = ''): readonly Conversation[] {
		const search = query.toLowerCase();
		return this.all('conversations')
			.filter(
				(conversation) =>
					conversation.kind === 'chat' &&
					(!search || conversation.title?.toLowerCase().includes(search))
			)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
	}
	conversation(id: ConversationId): Conversation | null {
		return this.get('conversations', id) ?? null;
	}
	messages(id: ConversationId): readonly StoredMessage[] {
		return this.all('messages')
			.filter((message) => message.conversationId === id)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
	}
	latestRun(id: ConversationId): WorkspaceValues['agent_runs'] | null {
		return (
			this.all('agent_runs')
				.filter((run) => run.conversationId === id)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0] ??
			null
		);
	}

	skill(noteId: NoteId): WorkspaceSkill | null {
		const note = this.get('notes', noteId);
		if (!note || note.archivedAt || note.kind !== 'skill') return null;
		const project = this.get('projects', note.projectId);
		const metadata = this.get('skills', noteId);
		return project && !project.archivedAt && metadata
			? { ...metadata, name: note.title, note }
			: null;
	}

	skills(projectId?: ProjectId): readonly SkillSummary[] {
		const notes = new Map(this.notes.map((note) => [note.id, note]));
		const pins = this.all('project_skill_pins');
		return this.all('skills').flatMap((skill) => {
			const note = notes.get(skill.noteId);
			if (!note) return [];
			return [
				{
					...skill,
					name: note.title,
					projectId: note.projectId,
					isPinned: projectId
						? pins.some((pin) => pin.projectId === projectId && pin.skillNoteId === skill.noteId)
						: false
				}
			];
		});
	}
	shell(userId: string): ShellContext | null {
		const user = this.get('users', userId);
		if (!user) return null;
		const projects = this.projects;
		const suggestions = this.pendingSuggestions;
		return {
			user,
			projects,
			noteTree: this.notes.filter((note) => note.kind !== 'skill'),
			skills: this.skills().filter((skill) => skill.isEnabled),
			pendingSuggestionCount: suggestions.length,
			pendingMemoryNotifications: this.memoryPresentation.pendingNotifications(
				projects,
				suggestions
			)
		};
	}
	private get pendingSuggestions() {
		return this.all('suggestions').filter((suggestion) => {
			if (suggestion.status !== 'proposed') return false;
			const source = suggestion.noteId ? this.get('notes', suggestion.noteId) : undefined;
			if (source && this.get('projects', source.projectId)?.archivedAt) return false;
			const projectId =
				'projectId' in suggestion.payload ? suggestion.payload.projectId : undefined;
			return !projectId || !this.get('projects', projectId)?.archivedAt;
		});
	}
	private isActiveProject(projectId: ProjectId): boolean {
		const project = this.get('projects', projectId);
		return project !== undefined && !project.archivedAt;
	}
	memories(projectId?: ProjectId): readonly MemoryEntry[] {
		if (projectId && !this.isActiveProject(projectId)) return [];
		return this.all('memory_entries')
			.filter((entry) => !entry.deletedAt && entry.projectId === projectId)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	memorySuggestions(projectId?: ProjectId): readonly MemorySuggestionView[] {
		if (projectId && !this.isActiveProject(projectId)) return [];
		return this.suggestionPresentation.newestMemoryViews(
			this.suggestionPresentation
				.pendingMemorySuggestions(this.pendingSuggestions, projectId)
				.flatMap((suggestion) => {
					const provenance = suggestion.provenanceId
						? this.get('provenance', suggestion.provenanceId)
						: undefined;
					if (!provenance) return [];
					const anchor = suggestion.sourceAnchorId
						? this.get('source_anchors', suggestion.sourceAnchorId)
						: undefined;
					return [
						this.suggestionPresentation.assembleSuggestionView(suggestion, {
							origin: this.provenancePresentation.provenanceOrigin(provenance),
							anchor
						})
					];
				})
		);
	}
	attachments(owner: { kind: 'project' | 'note'; id: string }): readonly AttachmentView[] {
		return this.all('attachments')
			.filter(
				(attachment) =>
					this.isActiveProject(attachment.projectId) &&
					(owner.kind === 'project'
						? attachment.projectId === owner.id && !attachment.noteId
						: attachment.noteId === owner.id)
			)
			.flatMap((attachment) => {
				const version = attachment.currentVersionId
					? this.get('attachment_versions', attachment.currentVersionId)
					: undefined;
				return version
					? [{ attachment: { ...attachment, currentVersionId: version.id }, version }]
					: [];
			})
			.sort((a, b) => a.attachment.path.localeCompare(b.attachment.path));
	}

	/**
	 * What the chat composer can `@` mention besides notes: live widgets, diagrams of either
	 * kind and files, in one project when the chat has one and across active projects when it
	 * does not. Matched by title, or by file name for an attachment.
	 */
	mentionableResources(
		query: string,
		projectId?: ProjectId
	): {
		readonly widgets: readonly Widget[];
		readonly diagrams: readonly Diagram[];
		readonly attachments: readonly AttachmentView[];
	} {
		const search = query.trim().toLowerCase();
		const inScope = (owner: ProjectId): boolean =>
			this.isActiveProject(owner) && (!projectId || owner === projectId);
		const matches = (name: string | undefined): boolean =>
			!search || (name ?? '').toLowerCase().includes(search);
		return {
			widgets: this.all('widgets')
				.filter(
					(widget) => inScope(widget.projectId) && !widget.archivedAt && matches(widget.title)
				)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
			diagrams: this.all('diagrams')
				.filter(
					(diagram) => inScope(diagram.projectId) && !diagram.archivedAt && matches(diagram.title)
				)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
			attachments: this.all('attachments')
				.filter((attachment) => inScope(attachment.projectId) && matches(attachment.path))
				.flatMap((attachment) => {
					const version = attachment.currentVersionId
						? this.get('attachment_versions', attachment.currentVersionId)
						: undefined;
					return version
						? [{ attachment: { ...attachment, currentVersionId: version.id }, version }]
						: [];
				})
				.sort((a, b) => a.attachment.path.localeCompare(b.attachment.path))
		};
	}

	trashedNotes(projectId?: ProjectId): readonly TrashedNote[] {
		const projects = new Map(this.projects.map((project) => [project.id, project]));
		return this.all('notes')
			.flatMap((note) => {
				const project = projects.get(note.projectId);
				if (
					!project ||
					!note.archivedAt ||
					note.kind === 'skill' ||
					(projectId && note.projectId !== projectId)
				)
					return [];
				return [{ ...note, archivedAt: note.archivedAt, projectName: project.name }];
			})
			.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || a.id.localeCompare(b.id));
	}
	trashedDiagrams(projectId?: ProjectId): readonly Diagram[] {
		return this.all('diagrams')
			.filter(
				(diagram) =>
					diagram.archivedAt &&
					this.isActiveProject(diagram.projectId) &&
					(!projectId || diagram.projectId === projectId)
			)
			.sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!));
	}
	/** A widget in an active project (ADR 0009), or null. */
	widget(widgetId: string): Widget | null {
		const widget = this.get('widgets', widgetId);
		if (!widget || !this.isActiveProject(widget.projectId)) return null;
		return widget;
	}
	/** Active widgets in a project, newest change first, matched by title. */
	widgets(projectId: ProjectId, query = ''): readonly Widget[] {
		if (!this.isActiveProject(projectId)) return [];
		const search = query.trim().toLowerCase();
		return this.all('widgets')
			.filter(
				(widget) =>
					widget.projectId === projectId &&
					!widget.archivedAt &&
					(!search || widget.title.toLowerCase().includes(search))
			)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
	}
	trashedWidgets(projectId?: ProjectId): readonly Widget[] {
		return this.all('widgets')
			.filter(
				(widget) =>
					widget.archivedAt &&
					this.isActiveProject(widget.projectId) &&
					(!projectId || widget.projectId === projectId)
			)
			.sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!));
	}
	diagram(diagramId: string): Diagram | null {
		const diagram = this.all('diagrams').find((diagram) => diagram.id === diagramId);
		if (!diagram || this.get('projects', diagram.projectId)?.archivedAt) return null;
		return diagram;
	}
	diagrams(projectId: ProjectId, query = ''): readonly Diagram[] {
		if (!this.isActiveProject(projectId)) return [];
		const search = query.toLowerCase();
		return this.all('diagrams')
			.filter(
				(diagram) =>
					diagram.projectId === projectId &&
					diagram.kind === 'drawio' &&
					!diagram.archivedAt &&
					(!search ||
						diagram.title?.toLowerCase().includes(search) ||
						diagram.searchableText?.toLowerCase().includes(search))
			)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
	artifacts(projectId: ProjectId, query = ''): readonly ArtifactView[] {
		const project = this.get('projects', projectId);
		if (!project || project.archivedAt) return [];
		const search = query.toLowerCase();
		return this.all('artifacts')
			.filter((artifact) => artifact.projectId === projectId)
			.map((artifact) => {
				const template = artifact.templateId
					? this.get('project_templates', artifact.templateId)
					: undefined;
				const sources = artifact.sourceNoteIds.map((id) => this.get('notes', id));
				const changed = sources.some((note) => note && note.updatedAt > artifact.createdAt);
				const stale = changed
					? true
					: sources.every((note) => note !== undefined)
						? false
						: undefined;
				return {
					...artifact,
					projectName: project.name,
					...(template ? { templateName: template.name } : {}),
					stale
				};
			})
			.filter(
				(artifact) =>
					!search ||
					artifact.title.toLowerCase().includes(search) ||
					artifact.format.includes(search) ||
					artifact.templateName?.toLowerCase().includes(search)
			)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
	}

	capabilityCounts(
		projectId?: ProjectId
	): Record<'memory' | 'notes' | 'todos' | 'attachments', number> {
		return {
			memory: this.memories(projectId).filter((entry) => entry.shareWithAgents).length,
			notes: projectId
				? this.notes.filter((note) => note.projectId === projectId && note.kind === 'note').length
				: 0,
			todos: projectId ? this.todos({ projectId, status: 'open' }).length : 0,
			attachments: projectId ? this.attachments({ kind: 'project', id: projectId }).length : 0
		};
	}

	agentPreferences(userId: UserId): AgentPreferenceValues {
		return (
			this.get('agent_preferences', userId) ?? {
				userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true
			}
		);
	}

	toolPreferences(userId: string, projectId?: ProjectId): readonly ToolPreference[] {
		const user = new Map(
			this.all('tool_preferences')
				.filter((entry) => entry.userId === userId)
				.map((entry) => [entry.toolName, entry.enabled])
		);
		const project = new Map(
			this.all('project_tool_overrides')
				.filter((entry) => entry.userId === userId && entry.projectId === projectId)
				.map((entry) => [entry.toolName, entry.enabled])
		);
		return TOOL_DESCRIPTIONS.map((tool): ToolPreference => {
			const locked = LOCKED_TOOL_NAMES.some((name) => name === tool.name);
			const override = project.get(tool.name);
			const preference = user.get(tool.name);
			return {
				...tool,
				locked,
				enabled: locked ? true : (override ?? preference ?? true),
				source: locked
					? 'default'
					: override !== undefined
						? 'project'
						: preference !== undefined
							? 'user'
							: 'default'
			};
		});
	}

	project(projectId: ProjectId): ProjectView | null {
		const project = this.get('projects', projectId);
		if (!project || project.archivedAt) return null;
		const entries = this.notes
			.filter((note) => note.projectId === projectId && note.kind !== 'skill')
			.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
		return { project, tree: this.projectPresentation.assemble(entries) };
	}
	note(
		noteId: NoteId
	): { readonly view: NoteView; readonly missing: readonly WorkspaceResourceIdentity[] } | null {
		const note = this.get('notes', noteId);
		if (!note) return null;
		const missing: WorkspaceResourceIdentity[] = [];
		const project = this.get('projects', note.projectId);
		if (project?.archivedAt) return null;
		if (!project) missing.push({ type: 'projects', id: [note.projectId] });
		const preferences = this.get('user_preferences', note.userId);
		const backlinks = this.all('note_relationships')
			.filter(
				(relationship) =>
					relationship.sourceNoteId === noteId || relationship.targetNoteId === noteId
			)
			.flatMap((relationship) => {
				const source = this.get('notes', relationship.sourceNoteId);
				const target = this.get('notes', relationship.targetNoteId);
				if (!source) missing.push({ type: 'notes', id: [relationship.sourceNoteId] });
				if (!target) missing.push({ type: 'notes', id: [relationship.targetNoteId] });
				if (!source || !target) return [];
				if (
					this.get('projects', source.projectId)?.archivedAt ||
					this.get('projects', target.projectId)?.archivedAt
				)
					return [];
				return [this.backlinkPresentation.assembleBacklinkView(relationship, source, target)];
			});
		const references = this.all('references')
			.filter((reference) => reference.noteId === noteId)
			.map((reference) => {
				const anchor = reference.sourceAnchorId
					? this.get('source_anchors', reference.sourceAnchorId)
					: undefined;
				if (reference.sourceAnchorId && !anchor)
					missing.push({ type: 'source_anchors', id: [reference.sourceAnchorId] });
				const { projectId: _projectId, ...domainReference } = reference;
				return this.referencePresentation.assembleReferenceView(domainReference, { anchor });
			});
		const pendingSuggestions = this.pendingSuggestions
			.filter((suggestion) => suggestion.noteId === noteId)
			.flatMap((suggestion) => {
				const provenance = this.get('provenance', suggestion.provenanceId);
				if (!provenance) {
					missing.push({ type: 'provenance', id: [suggestion.provenanceId] });
					return [];
				}
				const anchor = suggestion.sourceAnchorId
					? this.get('source_anchors', suggestion.sourceAnchorId)
					: undefined;
				if (suggestion.sourceAnchorId && !anchor)
					missing.push({ type: 'source_anchors', id: [suggestion.sourceAnchorId] });
				return [
					this.suggestionPresentation.assembleSuggestionView(suggestion, {
						note,
						anchor,
						origin: this.provenancePresentation.provenanceOrigin(provenance)
					})
				];
			});
		return {
			view: this.notePresentation.assemble({
				note,
				backlinks,
				references,
				diagrams: this.all('diagrams').filter(
					(diagram) => diagram.sourceNoteId === noteId && !diagram.archivedAt
				),
				todos: this.todos({ noteId }),
				pendingSuggestions,
				sectionNumbering: this.sections.view(
					note.sectionNumbering,
					project?.sectionNumberingDefault,
					preferences?.sectionNumberingDefault
				)
			}),
			missing
		};
	}

	todo(todo: Todo): TodoView | null {
		const project = this.get('projects', todo.projectId);
		if (todo.deletedAt || !project || project.archivedAt) return null;
		const anchor = todo.sourceAnchorId
			? this.get('source_anchors', todo.sourceAnchorId)
			: undefined;
		const origin = anchor ? this.get('notes', anchor.noteId) : undefined;
		const linked = todo.linkedNoteId ? this.get('notes', todo.linkedNoteId) : undefined;
		const provenance = todo.provenanceId ? this.get('provenance', todo.provenanceId) : undefined;
		return this.todoPresentation.view(todo, {
			anchor: anchor ?? null,
			origin: origin ?? null,
			linked: linked ?? null,
			provenance: provenance ?? null
		});
	}
	todos(filter: TodoListFilter = {}): readonly TodoView[] {
		const anchors = new Set(
			this.all('source_anchors')
				.filter((anchor) => anchor.noteId === filter.noteId)
				.map((anchor) => anchor.id)
		);
		return this.all('todos')
			.filter(
				(todo) =>
					(!filter.projectId || todo.projectId === filter.projectId) &&
					(!filter.status || todo.status === filter.status) &&
					(!filter.responsibility || todo.responsibility === filter.responsibility) &&
					(!filter.category || todo.category === filter.category) &&
					(!filter.dueBefore || (todo.dueDate !== undefined && todo.dueDate <= filter.dueBefore)) &&
					(!filter.noteId ||
						(todo.sourceAnchorId !== undefined && anchors.has(todo.sourceAnchorId)))
			)
			.sort((a, b) => {
				if (a.dueDate !== b.dueDate) {
					if (!a.dueDate) return 1;
					if (!b.dueDate) return -1;
					return a.dueDate.localeCompare(b.dueDate);
				}
				return b.updatedAt.localeCompare(a.updatedAt);
			})
			.flatMap((todo) => {
				const view = this.todo(todo);
				return view ? [view] : [];
			});
	}
	get categories(): readonly string[] {
		return [
			...new Set(this.todos().flatMap(({ todo }) => (todo.category ? [todo.category] : [])))
		].sort();
	}
	today(today: LocalDate): TodayView {
		const due = this.todos({ dueBefore: today, responsibility: 'mine' });
		const notes = this.notes.filter((note) => note.kind !== 'skill');
		return this.todayPresentation.assembleToday({
			today,
			due,
			waiting: this.todos({ responsibility: 'waiting_on' }),
			notes,
			pendingSuggestionCount: this.pendingSuggestions.length
		});
	}
}
