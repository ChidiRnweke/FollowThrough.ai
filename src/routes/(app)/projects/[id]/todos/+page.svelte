<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TodosWorkspace from '$lib/components/todos/workspace/todos-workspace.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
</script>

<PageShell
	width="wide"
	fill
	title="Todos"
	description="Commitments and follow-ups in {data.project.name}."
>
	<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
	{#snippet breadcrumb()}
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/projects/{data.project.id}">
						{data.project.name}
					</Breadcrumb.Link>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	{/snippet}
	<TodosWorkspace
		todos={data.todos}
		view={data.view}
		basePath="/projects/{data.project.id}/todos"
		projectId={data.project.id}
		notes={data.shell.noteTree}
		categories={data.categories}
	/>
</PageShell>
