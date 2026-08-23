<script lang="ts">
	import type {
		DiagramRevision,
		DiagramRevisionId,
		DiagramRevisionSummary,
		DrawioDiagram
	} from '$lib/models/diagrams';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtHistory } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import DiagramPreview from '../diagram-preview.svelte';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(false),
		diagram,
		currentPreview,
		revisions,
		selectedId = $bindable(undefined),
		selected,
		onrestore
	}: {
		open?: boolean;
		diagram: DrawioDiagram;
		currentPreview?: string;
		revisions: readonly DiagramRevisionSummary[];
		selectedId?: DiagramRevisionId;
		selected?: DiagramRevision;
		onrestore: (revisionId: DiagramRevisionId) => Promise<void>;
	} = $props();

	let restoring = $state(false);

	$effect(() => {
		if (open && !selectedId && revisions[0]) selectedId = revisions[0].id;
	});

	async function restore(): Promise<void> {
		if (!selectedId) return;
		restoring = true;
		try {
			await onrestore(selectedId);
		} finally {
			restoring = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
		<Dialog.Header>
			<Dialog.Title>Version history</Dialog.Title>
			<Dialog.Description>Compare a previous publication with the current draft.</Dialog.Description
			>
		</Dialog.Header>
		{#if revisions.length === 0}
			<EmptyState
				icon={FtHistory}
				title="No versions yet"
				hint="Publishing this diagram takes its first snapshot."
			/>
		{:else}
			<div class="grid min-h-0 flex-1 gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
				<ul class="min-h-0 divide-y divide-border overflow-y-auto pr-1" aria-label="Versions">
					{#each revisions as revision (revision.id)}
						<li>
							<Button
								variant="ghost"
								aria-current={selectedId === revision.id ? 'true' : undefined}
								class={cn(
									'h-auto min-h-11 w-full items-start justify-start px-3 py-2 text-left',
									selectedId === revision.id && 'bg-primary/5'
								)}
								onclick={() => (selectedId = revision.id)}
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium"
										>{formatRelativeTime(revision.createdAt)}</span
									>
									<span class="block truncate text-xs text-muted-foreground"
										>{revision.title ?? 'Untitled diagram'}</span
									>
								</span>
								{#if revision.isPublished}<Badge variant="secondary">Published</Badge>{/if}
							</Button>
						</li>
					{/each}
				</ul>
				<div class="grid min-h-0 gap-4 overflow-auto md:grid-cols-2">
					<section class="min-w-0">
						<h3 class="mb-2 text-sm font-medium">Selected publication</h3>
						{#if selected}
							<DiagramPreview
								kind="drawio"
								source={selected.source}
								renderedSvg={selected.renderedSvg}
								title={selected.title}
								class="max-w-full"
							/>
						{:else}<p class="text-sm text-muted-foreground">Loading publication.</p>{/if}
					</section>
					<section class="min-w-0">
						<h3 class="mb-2 text-sm font-medium">Current draft</h3>
						<DiagramPreview
							kind="drawio"
							source={diagram.source}
							renderedSvg={currentPreview}
							title={diagram.title}
							class="max-w-full"
						/>
					</section>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>Close</Button>
				<Button disabled={!selectedId || restoring} onclick={() => void restore()}
					>Restore as draft</Button
				>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
