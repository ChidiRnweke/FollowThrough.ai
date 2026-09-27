<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ProjectTree from './project-tree.svelte';
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project } from '$lib/models/projects';
	let {
		projects,
		notes,
		activeNoteId
	}: { projects: readonly Project[]; notes: readonly NoteSummary[]; activeNoteId?: NoteId } =
		$props();
</script>

<Sidebar.Provider
	><ProjectTree {projects} noteTree={notes} {activeNoteId} activePath="" /></Sidebar.Provider
>
