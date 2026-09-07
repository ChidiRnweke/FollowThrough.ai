<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { TodosWorkspace } from '$lib/components/todos';

	let { data } = $props();
</script>

<PageShell width="wide" fill title="Todos" description="Every commitment across all projects.">
	<TodosWorkspace
		todos={data.todos}
		view={data.view}
		basePath="/todos"
		projects={data.session.shell.projects}
		notes={data.session.shell.noteTree}
		categories={data.categories}
	/>
</PageShell>
