<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { TodosWorkspace } from '$lib/components/todos';

	let { data } = $props();
	const todos = $derived(data.session.resources.views.todos(data.filter));
	const categories = $derived(data.session.resources.views.categories);
</script>

<PageShell width="wide" fill title="Todos" description="Every commitment across all projects.">
	<TodosWorkspace
		{todos}
		view={data.view}
		basePath="/todos"
		projects={data.session.shell.projects}
		notes={data.session.shell.noteTree}
		{categories}
	/>
</PageShell>
