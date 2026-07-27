<script lang="ts">
	import type { ImportMarkdownArchiveOutput, NoteId, ProjectId } from '$lib/models';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		projectId,
		parentId,
		destination
	}: {
		open?: boolean;
		projectId: ProjectId;
		/** Import under a folder rather than at the project root. */
		parentId?: NoteId;
		/** Named so the dialog can say where the notes will land. */
		destination: string;
	} = $props();

	let files = $state<FileList | undefined>(undefined);
	let busy = $state(false);
	let error = $state('');
	let report = $state<ImportMarkdownArchiveOutput | undefined>(undefined);

	const archive = $derived(files?.[0]);

	async function run(): Promise<void> {
		if (!archive) return;
		busy = true;
		error = '';
		try {
			const body = new FormData();
			body.set('archive', archive);
			body.set('projectId', projectId);
			if (parentId) body.set('parentId', parentId);
			const response = await fetch('/api/imports', { method: 'POST', body });
			const payload = await response.json();
			if (!response.ok) {
				error = (payload as { message?: string }).message ?? 'The import failed.';
				return;
			}
			report = payload as ImportMarkdownArchiveOutput;
			await invalidateAll();
		} catch {
			error = 'The import could not be sent. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}

	function reset(): void {
		files = undefined;
		report = undefined;
		error = '';
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) reset();
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Import an existing project</Dialog.Title>
			<Dialog.Description>
				A .zip of Markdown files becomes notes in {destination}, with its folders kept.
			</Dialog.Description>
		</Dialog.Header>

		{#if report}
			<!-- The report is the feature, not its epilogue: an import is not all-or-nothing,
			     so without this a partially failed import looks exactly like a clean one. -->
			<div class="flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<p class="text-sm">
						Imported {report.importedNoteIds.length}
						{report.importedNoteIds.length === 1 ? 'note' : 'notes'}{report.createdFolderIds
							.length > 0
							? ` into ${report.createdFolderIds.length} ${report.createdFolderIds.length === 1 ? 'folder' : 'folders'}`
							: ''}.
					</p>
					{#if report.unmappedFrontmatterKeys.length > 0}
						<p class="text-xs text-muted-foreground">
							Frontmatter not imported: {report.unmappedFrontmatterKeys.join(', ')}.
						</p>
					{/if}
				</div>

				{#if report.failed.length > 0}
					<section class="flex flex-col gap-2">
						<h3 class="eyebrow">Could not import</h3>
						<ul class="flex flex-col gap-1 text-xs">
							{#each report.failed as failure (failure.path)}
								<li>
									<span class="font-medium">{failure.path}</span>
									<span class="text-muted-foreground"> — {failure.message}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if report.skipped.length > 0}
					<section class="flex flex-col gap-2">
						<h3 class="eyebrow">Skipped</h3>
						<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
							{#each report.skipped as skip (skip.path)}
								<li>
									<span class="font-medium">{skip.path}</span>
									<span class="text-muted-foreground"> — {skip.reason}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" size="sm" onclick={reset}>Import another</Button>
				<Button size="sm" onclick={() => (open = false)}>Done</Button>
			</Dialog.Footer>
		{:else}
			<div class="flex flex-col gap-2">
				<Label for="import-archive" class="text-xs text-muted-foreground">Archive</Label>
				<Input id="import-archive" type="file" accept=".zip,application/zip" bind:files />
				<p class="text-xs text-muted-foreground">
					Up to 25 MB. Each note takes its name from its file name.
				</p>
				{#if error}<p class="text-xs text-destructive">{error}</p>{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" size="sm" onclick={() => (open = false)}>Cancel</Button>
				<Button size="sm" disabled={!archive || busy} onclick={run}>
					{busy ? 'Importing…' : 'Import'}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
