<script lang="ts">
	import type { ProjectId, ArchiveLinkIssue } from '$lib/models/projects';
	import { createArchiveImports } from '$lib/factories/notes/archive-import';
	const imports = createArchiveImports();
	import type { NoteId } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import FileDropzone from '../attachments/file-dropzone.svelte';

	const linkIssueMessages: Record<ArchiveLinkIssue['reason'], string> = {
		ambiguous: 'More than one note matches. Choose the intended note.',
		missing: 'No matching note exists in this archive.',
		unavailable: 'The target note could not be imported.',
		unsupported: 'Heading links need to be connected manually.'
	};

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
	const busy = $derived(imports.busy);
	const error = $derived(imports.error);
	const report = $derived(imports.report);

	$effect(() => {
		// An in-flight import belongs to this dialog destination.
		const scope = { open, projectId, parentId };
		if (!scope.open) return;
		return () => imports.reset();
	});

	function run(): void {
		if (archive) void imports.import(archive, projectId, parentId);
	}

	function reset(): void {
		archive = undefined;
		imports.reset();
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

				{#if report.unresolvedLinks.length > 0}
					<section class="flex flex-col gap-2">
						<h3 class="eyebrow">Links left unresolved</h3>
						<p class="text-xs text-muted-foreground">
							These links remain as written in the imported notes.
						</p>
						<ul class="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
							{#each report.unresolvedLinks as issue (issue)}
								<li>
									<span class="font-medium">{issue.path}: [[{issue.target}]]</span><span
										class="text-muted-foreground"
									>
										— {linkIssueMessages[issue.reason]}</span
									>
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
					disabled={busy}
					label="Drop a .zip here, or choose one"
					hint="Each note takes its name from its file name."
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
