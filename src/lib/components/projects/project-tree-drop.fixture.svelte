<script lang="ts" module>
	import type { NoteId as DropNoteId } from '$lib/models/notes';

	/** Which list received the dropped entry: a folder row, or a folder's or the root's list. */
	export type TreeDrop = {
		noteId: DropNoteId;
		zone: `into:${DropNoteId}` | DropNoteId | 'root';
	};
</script>

<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { SvelteMap } from 'svelte/reactivity';
	import type { DndEvent } from 'svelte-dnd-action';
	import ProjectTreeView from './project-tree-view.svelte';
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';

	let {
		projects,
		notes,
		openFolders,
		ondrop
	}: {
		projects: readonly Project[];
		notes: readonly NoteSummary[];
		openFolders: readonly NoteId[];
		ondrop: (drop: TreeDrop) => void;
	} = $props();

	// The library renders from the items it is handed back, so the fixture keeps
	// each list's in-flight order the way the tree container does.
	const overrides = new SvelteMap<string, NoteSummary[]>();

	const listKey = (parentId?: NoteId): NoteId | 'root' => parentId ?? 'root';
	const zoneItems = (_projectId: ProjectId, parentId?: NoteId): NoteSummary[] =>
		overrides.get(listKey(parentId)) ??
		notes.filter((note) => (note.parentId ?? undefined) === parentId);
	const intoItems = (folderId: NoteId): NoteSummary[] => overrides.get(`into:${folderId}`) ?? [];

	function record(zone: TreeDrop['zone'], event: CustomEvent<DndEvent<NoteSummary>>): void {
		const noteId = event.detail.info.id as NoteId;
		if (event.detail.items.some((item) => item.id === noteId)) ondrop({ noteId, zone });
		overrides.clear();
	}

	const handleDndConsider = (
		_projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	) => overrides.set(listKey(parentId), event.detail.items);
	const handleDndFinalize = (
		_projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	) => record(listKey(parentId), event);
	const handleIntoConsider = (folder: NoteSummary, event: CustomEvent<DndEvent<NoteSummary>>) =>
		overrides.set(`into:${folder.id}`, event.detail.items);
	const handleIntoFinalize = (folder: NoteSummary, event: CustomEvent<DndEvent<NoteSummary>>) =>
		record(`into:${folder.id}`, event);

	const isProjectOpen = () => true;
	const isFolderOpen = (folderId: NoteId) => openFolders.includes(folderId);
	const foldersOf = (): NoteSummary[] => notes.filter((note) => note.kind === 'folder');
	const isCreatingIn = () => false;
	const isDropBlocked = () => false;
	const folderDrop = () => ({ band: 'top' as const, holdsSlot: false });
	const noop = () => undefined;
	const asyncNoop = async () => undefined;
</script>

<Sidebar.Provider>
	<ProjectTreeView
		{projects}
		activeNoteId={undefined}
		activePath=""
		transitionsReady={false}
		busy={false}
		{zoneItems}
		{isProjectOpen}
		{isFolderOpen}
		{foldersOf}
		{isCreatingIn}
		toggle={noop}
		toggleProject={noop}
		startCreate={noop}
		handleInlineCreateKeydown={noop}
		handleInlineCreateBlur={noop}
		submitInline={asyncNoop}
		{handleDndConsider}
		{handleDndFinalize}
		{intoItems}
		{handleIntoConsider}
		{handleIntoFinalize}
		{isDropBlocked}
		{folderDrop}
		moveEntry={asyncNoop}
		archiveEntry={asyncNoop}
		archiveProject={asyncNoop}
		onopen={noop}
		onopenbackground={noop}
		onopensplit={noop}
		onrenameproject={noop}
	/>
</Sidebar.Provider>
