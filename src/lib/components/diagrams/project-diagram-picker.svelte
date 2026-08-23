<script lang="ts">
	import type { DiagramId } from '$lib/models/diagrams';
	import type { ProjectId } from '$lib/models/projects';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtWorkflow as Workflow } from '$lib/components/icons';
	import { listProjectDiagrams } from '$lib/remote/diagrams/diagrams.remote';
	import DiagramPreview from './diagram-preview.svelte';

	let {
		open = $bindable(false),
		projectId,
		onpick
	}: {
		open?: boolean;
		projectId: ProjectId;
		onpick: (diagramId: DiagramId) => void;
	} = $props();

	// Same-project only: a note cannot render a diagram from a project it does not
	// belong to, and the server rejects it anyway.
	const query = $derived(open ? listProjectDiagrams(projectId) : undefined);
	const diagrams = $derived(query?.current?.diagrams ?? []);

	function pick(diagramId: DiagramId): void {
		open = false;
		onpick(diagramId);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Insert a diagram</Dialog.Title>
			<Dialog.Description>
				Diagrams kept in this project. The note shows the current version, so editing the diagram
				updates every note that renders it.
			</Dialog.Description>
		</Dialog.Header>
		{#if diagrams.length === 0}
			<EmptyState
				icon={Workflow}
				title="No diagrams to insert yet."
				hint="A diagram starts in conversation, and appears here once you keep it."
			/>
		{:else}
			<ul class="grid max-h-96 grid-cols-1 gap-4 overflow-y-auto pr-3 sm:grid-cols-2">
				{#each diagrams as diagram (diagram.id)}
					<li>
						<Button
							variant="ghost"
							class="flex h-auto w-full flex-col items-stretch justify-start gap-2 p-2 text-left font-normal whitespace-normal"
							onclick={() => pick(diagram.id)}
						>
							<span
								class="block h-28 w-full overflow-hidden rounded-md ring-1 ring-inset ring-border"
							>
								<DiagramPreview
									kind={diagram.kind}
									source={diagram.source}
									renderedSvg={diagram.renderedSvg}
									title={diagram.title ?? 'Untitled diagram'}
									class="h-full w-full object-contain"
								/>
							</span>
							<span class="block truncate text-sm">{diagram.title ?? 'Untitled diagram'}</span>
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Dialog.Content>
</Dialog.Root>
