<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { TodosWorkspace } from '$lib/components/todos';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
	const project = $derived(data.session.resources.views.get('projects', data.projectId));
	const todos = $derived(data.session.resources.views.todos(data.filter));
	const categories = $derived(data.session.resources.views.categories);
</script>

{#if project}
	<PageShell
		width="wide"
		fill
		title="Todos"
		description="Commitments and follow-ups in {project.name}."
	>
		<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
		{#snippet breadcrumb()}
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/projects/{project.id}">
							{project.name}
						</Breadcrumb.Link>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
		{/snippet}
		<TodosWorkspace
			{todos}
			view={data.view}
			basePath="/projects/{project.id}/todos"
			projectId={project.id}
			notes={data.session.shell.noteTree}
			{categories}
		/>
	</PageShell>
{:else}<p>This project is no longer available.</p>{/if}
