<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TodosWorkspace from '$lib/components/app/pages/todos-workspace.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
</script>

<PageShell>
	{#snippet header()}
		<div class="space-y-1">
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/projects/{data.project.id}">
							{data.project.name}
						</Breadcrumb.Link>
					</Breadcrumb.Item>
					<Breadcrumb.Separator />
					<Breadcrumb.Item>
						<Breadcrumb.Page>Todos</Breadcrumb.Page>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="page-title">Todos</h1>
			<p class="text-sm text-muted-foreground">
				Commitments and follow-ups in {data.project.name}.
			</p>
		</div>
	{/snippet}
	<TodosWorkspace
		todos={data.todos}
		view={data.view}
		basePath="/projects/{data.project.id}/todos"
		projectId={data.project.id}
		notes={data.shell.noteTree}
	/>
</PageShell>
