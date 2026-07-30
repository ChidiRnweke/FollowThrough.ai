<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TodosWorkspace from '$lib/components/app/pages/todos-workspace.svelte';

	let { data } = $props();
</script>

<PageShell width="wide" fill title="Todos" description="Every commitment across all projects.">
	<TodosWorkspace
		todos={data.todos}
		view={data.view}
		basePath="/todos"
		projects={data.shell.projects}
		notes={data.shell.noteTree}
	/>
</PageShell>
