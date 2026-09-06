import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { ShellContext, TodayView, LocalDate } from '$lib/models/workspace';
import type { Todo, TodoListFilter, TodoView } from '$lib/models/todos';
import type { ProjectId, ProjectTreeNode, ProjectView } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';

type ResourceValues = { [R in WorkspaceRecord as R['type']]: R['value'] };
type ResourceOf<K extends keyof ResourceValues> = WorkspaceRecord & {
	type: K;
	value: ResourceValues[K];
};

const hasType = <K extends WorkspaceRecord['type']>(
	record: WorkspaceRecord,
	type: K
): record is ResourceOf<K> => record.type === type;

/** Pure projections of the normalized workspace, including the caller's local write overlays. */
export class WorkspaceViews {
	constructor(private readonly records: ReadonlyMap<string, WorkspaceRecord>) {}
	all<K extends WorkspaceRecord['type']>(type: K): ResourceValues[K][] {
		return [...this.records.values()]
			.filter((record): record is ResourceOf<K> => record.type === type)
			.map((record) => record.value);
	}
	get<K extends WorkspaceRecord['type']>(
		type: K,
		...id: [string, ...string[]]
	): ResourceValues[K] | undefined {
		const record = this.records.get(JSON.stringify([type, ...id]));
		if (!record || !hasType(record, type)) return undefined;
		return record.value;
	}
	get projects() {
		return this.all('projects')
			.filter((project) => !project.archivedAt)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}
	get notes() {
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
	skills(projectId?: ProjectId): readonly SkillSummary[] {
		const notes = new Map(this.notes.map((note) => [note.id, note]));
		const pins = this.all('project_skill_pins');
		return this.all('skills').flatMap((skill) => {
			const note = notes.get(skill.noteId);
			if (!note || (projectId && note.projectId !== projectId)) return [];
			return [
				{
					...skill,
					projectId: note.projectId,
					isPinned: projectId
						? pins.some((pin) => pin.projectId === projectId && pin.skillNoteId === skill.noteId)
						: note.isPinned
				}
			];
		});
	}
	shell(userId: string): ShellContext | null {
		const user = this.get('users', userId);
		if (!user) return null;
		const projects = this.projects;
		const suggestions = this.all('suggestions').filter(
			(suggestion) => suggestion.status === 'proposed'
		);
		const memoryCounts = new Map<string | undefined, number>();
		for (const suggestion of suggestions) {
			if (suggestion.kind !== 'memory') continue;
			const id = suggestion.payload.projectId;
			memoryCounts.set(id, (memoryCounts.get(id) ?? 0) + 1);
		}
		const profileCount = memoryCounts.get(undefined);
		return {
			user,
			projects,
			noteTree: this.notes.filter((note) => note.kind !== 'skill'),
			skills: this.skills().filter((skill) => skill.isEnabled),
			pendingSuggestionCount: suggestions.length,
			pendingMemoryNotifications: [
				...(profileCount
					? [{ label: 'Profile memory', href: '/profile', count: profileCount }]
					: []),
				...projects.flatMap((project) => {
					const count = memoryCounts.get(project.id);
					return count
						? [
								{
									projectId: project.id,
									label: project.name,
									href: `/projects/${project.id}/memory`,
									count
								}
							]
						: [];
				})
			]
		};
	}
	project(projectId: ProjectId): ProjectView | null {
		const project = this.get('projects', projectId);
		if (!project || project.archivedAt) return null;
		const entries = this.notes
			.filter((note) => note.projectId === projectId && note.kind !== 'skill')
			.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
		const children = new Map<NoteId | undefined, typeof entries>();
		for (const entry of entries)
			children.set(entry.parentId, [...(children.get(entry.parentId) ?? []), entry]);
		const build = (parentId: NoteId | undefined): ProjectTreeNode[] =>
			(children.get(parentId) ?? []).map((entry) => ({ entry, children: build(entry.id) }));
		return { project, tree: build(undefined) };
	}
	todo(todo: Todo): TodoView {
		const anchor = todo.sourceAnchorId
			? this.get('source_anchors', todo.sourceAnchorId)
			: undefined;
		const origin = anchor ? this.get('notes', anchor.noteId) : undefined;
		const linked = todo.linkedNoteId ? this.get('notes', todo.linkedNoteId) : undefined;
		const source = linked ?? origin;
		const provenance = todo.provenanceId ? this.get('provenance', todo.provenanceId) : undefined;
		return {
			todo,
			...(source ? { sourceNote: { id: source.id, title: source.title } } : {}),
			...(origin ? { originNote: { id: origin.id, title: origin.title } } : {}),
			...(anchor ? { anchor } : {}),
			...(provenance ? { provenance } : {})
		};
	}
	todos(filter: TodoListFilter = {}): readonly TodoView[] {
		const projects = new Set(this.projects.map((project) => project.id));
		const anchors = new Set(
			this.all('source_anchors')
				.filter((anchor) => anchor.noteId === filter.noteId)
				.map((anchor) => anchor.id)
		);
		return this.all('todos')
			.filter(
				(todo) =>
					!todo.deletedAt &&
					projects.has(todo.projectId) &&
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
			.map((todo) => this.todo(todo));
	}
	get categories(): readonly string[] {
		return [
			...new Set(this.todos().flatMap(({ todo }) => (todo.category ? [todo.category] : [])))
		].sort();
	}
	today(today: LocalDate): TodayView {
		const due = this.todos({ dueBefore: today, responsibility: 'mine' });
		const notes = this.notes.filter((note) => note.kind !== 'skill');
		return {
			overdue: due.filter(({ todo }) => todo.dueDate !== undefined && todo.dueDate < today),
			dueToday: due.filter(({ todo }) => todo.dueDate === today),
			waitingOn: this.todos({ responsibility: 'waiting_on' }),
			pendingSuggestionCount: this.all('suggestions').filter(
				(suggestion) => suggestion.status === 'proposed'
			).length,
			pinnedNotes: notes.filter((note) => note.isPinned),
			recentNotes: [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		};
	}
}
