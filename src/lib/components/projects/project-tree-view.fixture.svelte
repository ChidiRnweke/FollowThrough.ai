<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ProjectTreeView from './project-tree-view.svelte';
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';

	const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;

	let {
		projects,
		notes,
		onopen = () => undefined
	}: {
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
	const moveEntry = async () => undefined;
	const archiveEntry = async () => undefined;
	const archiveProject = async () => undefined;
	const onopenbackground = () => undefined;
	const onopensplit = () => undefined;
	const onrenameproject = () => undefined;
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
		{toggle}
		{toggleProject}
		{startCreate}
		{handleInlineCreateKeydown}
		{handleInlineCreateBlur}
		{submitInline}
		{handleDndConsider}
		{handleDndFinalize}
		{moveEntry}
		{archiveEntry}
		{archiveProject}
		{onopen}
		{onopenbackground}
		{onopensplit}
		{onrenameproject}
	/>
</Sidebar.Provider>
