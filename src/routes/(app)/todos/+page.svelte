<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TodosWorkspace from '$lib/components/app/pages/todos-workspace.svelte';

	let { data } = $props();
</script>

<PageShell title="Todos" description="Your commitments and what you are waiting on.">
	<TodosWorkspace todos={data.todos} view={data.view} />
</PageShell>
