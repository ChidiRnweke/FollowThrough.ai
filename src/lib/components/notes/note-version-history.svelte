<script lang="ts">
	import type { Note, NoteRevision, NoteRevisionSummary } from '$lib/models/notes';
	import { noteRevisionText } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtHistory } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { cn } from '$lib/utils';
	import NoteVersionDiff from './note-version-diff.svelte';

	let {
		open = $bindable(false),
		note,
		revisions,
		loading = false,
		selectedId = $bindable(undefined),
		selected,
		onselect,
		onrestore
	}: {
		open?: boolean;
		/** The note as it stands — always the right-hand side of the diff. */
		note: Pick<Note, 'title' | 'plainText' | 'publishedRevision' | 'currentRevision'>;
		revisions: readonly NoteRevisionSummary[];
		loading?: boolean;
		selectedId?: NoteRevision['id'];
		/** The full body of `selectedId`, once its fetch settles. */
		selected?: NoteRevision;
		onselect: (revisionId: NoteRevision['id']) => void;
		onrestore: (revisionId: NoteRevision['id']) => Promise<void>;
	} = $props();

	let restoring = $state(false);

	const hasDraft = $derived(note.currentRevision > note.publishedRevision);

	async function restore(revisionId: NoteRevision['id']): Promise<void> {
		restoring = true;
		try {
			await onrestore(revisionId);
			open = false;
		} finally {
			restoring = false;
		}
	}

	function choose(revisionId: NoteRevision['id']): void {
		selectedId = revisionId;
		onselect(revisionId);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-dvh flex-col sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>Version history</Dialog.Title>
			<Dialog.Description>
				Each version is a snapshot taken when you published. Pick one to see what has changed since,
				or roll the note back to it.
			</Dialog.Description>
		</Dialog.Header>

		{#if revisions.length === 0}
			<EmptyState
				icon={FtHistory}
				title="No versions yet"
				hint="Publishing this note takes its first snapshot."
			/>
		{:else}
			<div class="grid min-h-0 gap-4 sm:grid-cols-[14rem_1fr]">
				<ul class="min-h-0 space-y-1 overflow-y-auto pr-1" aria-label="Versions">
					{#each revisions as revision (revision.id)}
						<li>
							<Button
								variant="ghost"
								aria-current={selectedId === revision.id ? 'true' : undefined}
								class={cn(
									'h-auto w-full flex-col items-stretch gap-0 rounded-md border px-3 py-2 text-left',
									selectedId === revision.id ? 'border-primary bg-primary/5' : 'border-transparent'
								)}
								onclick={() => choose(revision.id)}
							>
								<span class="flex items-center justify-between gap-2">
									<span class="truncate text-sm font-medium">{revision.title}</span>
									{#if revision.isPublished}
										<Badge variant="secondary">Published</Badge>
									{/if}
								</span>
								<span class="block pt-0.5 text-xs font-normal text-muted-foreground">
									Version {revision.revision} · {formatRelativeTime(revision.createdAt)}
								</span>
							</Button>
						</li>
					{/each}
				</ul>

				<div class="min-h-0">
					{#if loading}
						<p class="flex items-center gap-2 py-6 text-sm text-muted-foreground">
							<Spinner />Loading that version…
						</p>
					{:else if selected}
						<NoteVersionDiff
							base={noteRevisionText(selected)}
							candidate={noteRevisionText(note)}
							label="Changes since this version"
							caption={hasDraft
								? 'What the note says now, including unpublished changes, compared with this version'
								: 'What the note says now, compared with this version'}
						/>
					{:else}
						<p class="py-6 text-sm text-muted-foreground">
							Pick a version on the left to compare it with the note as it stands.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
			{#if selected}
				<ConfirmDelete
					title="Restore version {selected.revision}?"
					description="The note's current content is replaced. It stays in the history, so you can undo this the same way."
					confirmLabel="Restore"
					busy={restoring}
					onconfirm={() => restore(selected.id)}
				>
					{#snippet trigger(props)}
						<Button {...props} disabled={restoring}>
							{#if restoring}<Spinner data-icon="inline-start" />{/if}
							Restore this version
						</Button>
					{/snippet}
				</ConfirmDelete>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
