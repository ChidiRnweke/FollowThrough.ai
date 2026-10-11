<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { TodosWorkspace } from '$lib/components/todos';

	let { data } = $props();
	const todos = $derived(workspaceViews.todos(data.filter));
	const categories = $derived(workspaceViews.categories);
</script>

<PageShell width="wide" fill title="Todos" description="Every commitment across all projects.">
	<TodosWorkspace
		{todos}
		view={data.view}
		basePath="/todos"
		projects={workspaceViews.currentShell.projects}
		notes={workspaceViews.currentShell.noteTree}
		{categories}
	/>
</PageShell>
