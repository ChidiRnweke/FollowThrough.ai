<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { goto } from '$app/navigation';
	import * as Icon from '$lib/components/icons';
	import { TodoDetailPanel } from '$lib/components/todos';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
</script>

<PageShell title="Todo" description="Review and update this commitment." class="max-w-3xl">
	{#snippet actions()}
		<Button href={data.returnTo} variant="outline" size="sm">
			<Icon.ArrowLeft data-icon="inline-start" />
			Back
		</Button>
	{/snippet}
	<TodoDetailPanel
		todoId={data.todoId}
		notes={workspaceViews.currentShell.noteTree}
		ondeleted={() => void goto(data.returnTo)}
	/>
</PageShell>
