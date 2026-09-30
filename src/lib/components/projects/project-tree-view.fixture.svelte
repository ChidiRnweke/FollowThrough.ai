<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ProjectTreeView from './project-tree-view.svelte';
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project } from '$lib/models/projects';

	let {
		inventoryReady = true,
		projects,
		notes,
		onopen = () => undefined
	}: {
		inventoryReady?: boolean;
		projects: readonly Project[];
		notes: readonly NoteSummary[];
		onopen?: (noteId: NoteId) => void;
	} = $props();

	const zoneItems = (): NoteSummary[] => [...notes];
	const isProjectOpen = () => true;
	const isFolderOpen = () => true;
	const foldersOf = (): NoteSummary[] => [];
	const isCreatingIn = () => false;
	const toggle = () => undefined;
	const toggleProject = () => undefined;
	const startCreate = () => undefined;
	const handleInlineCreateKeydown = () => undefined;
	const handleInlineCreateBlur = () => undefined;
	const submitInline = async () => undefined;
	const handleDndConsider = () => undefined;
	const handleDndFinalize = () => undefined;
	const intoItems = (): NoteSummary[] => [];
	const handleIntoConsider = () => undefined;
	const handleIntoFinalize = () => undefined;
	const isDropBlocked = () => false;
	const folderDrop = () => ({ band: 'top' as const, holdsSlot: false });
	const moveEntry = async () => undefined;
	const archiveEntry = async () => undefined;
	const archiveProject = async () => undefined;
	const onopenbackground = () => undefined;
	const onopensplit = () => undefined;
	const onrenameproject = () => undefined;
</script>

<Sidebar.Provider>
	<ProjectTreeView
		{inventoryReady}
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
		{toggle}
		{toggleProject}
		{startCreate}
		{handleInlineCreateKeydown}
		{handleInlineCreateBlur}
		{submitInline}
		{handleDndConsider}
		{handleDndFinalize}
		{intoItems}
		{handleIntoConsider}
		{handleIntoFinalize}
		{isDropBlocked}
		{folderDrop}
		{moveEntry}
		{archiveEntry}
		{archiveProject}
		{onopen}
		{onopenbackground}
		{onopensplit}
		{onrenameproject}
	/>
</Sidebar.Provider>
