<script lang="ts">
	import { z } from 'zod';
	import type { ImportMarkdownArchiveOutput, ProjectId } from '$lib/models/projects';
	import { importMarkdownArchiveOutputSchema } from '$lib/models/projects';
	import type { NoteId } from '$lib/models/notes';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import FileDropzone from '../attachments/file-dropzone.svelte';

	/** Mirrors DEFAULT_ARCHIVE_LIMITS server-side, so the reject happens before the upload. */
	const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

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

	let archive = $state<File | undefined>(undefined);
	let busy = $state(false);
	let error = $state('');
	let report = $state<ImportMarkdownArchiveOutput | undefined>(undefined);

	/** What `/api/imports` answers with when it rejects the archive. */
	const failureSchema = z.object({ message: z.string() });

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
			const payload: unknown = await response.json();
			if (!response.ok) {
				error = failureSchema.safeParse(payload).data?.message ?? 'The import failed.';
				return;
			}
			const parsed = importMarkdownArchiveOutputSchema.safeParse(payload);
			if (!parsed.success) {
				// Deliberately not an empty report: the import ran, and saying so
				// while admitting the report is unreadable is the honest pair. An
				// empty report would claim it imported nothing.
				error = 'The import finished, but its report could not be read. Reload to see what landed.';
				return;
			}
			report = parsed.data;
			await workspaceSession.synchronize();
			// audit-allow: silent-catch — submission failure is rendered and the selected files remain available for retry.
		} catch {
			error = 'The import could not be sent. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}

	function reset(): void {
		archive = undefined;
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
				<FileDropzone
					bind:file={archive}
					accept=".zip,application/zip"
					extensions={['.zip']}
					maxBytes={MAX_ARCHIVE_BYTES}
					disabled={busy}
					label="Drop a .zip here, or choose one"
					hint="Up to 25 MB. Each note takes its name from its file name."
				/>
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
