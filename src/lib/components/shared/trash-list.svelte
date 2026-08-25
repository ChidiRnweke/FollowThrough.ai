<script lang="ts">
	// The trash is a promise the rest of the app makes: "Move to trash" says the thing
	// survives, and this list is where that turns out to be true. It stays deliberately
	// plain — an icon, a name, where it came from, when it went — because the only thing
	// anyone comes here to do is find one item and bring it back. Deleting for good is
	// the one thing here that breaks that promise, so it stays secondary and always asks.
	//
	// It is one list rather than a section per kind. Notes, folders and diagrams are the
	// only things that end up here, and a row says which it is with the icon that thing
	// already carries everywhere else — `FtDocument`, `FtFolder`, `FtWorkflow`. Splitting
	// into sections would answer "what is this" with a heading and leave the reader
	// scanning three lists to find one name.
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtTrash } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import {
		trashEntryIcon,
		trashEntryKey,
		trashEntryLabel,
		type TrashEntry
	} from '$lib/components/shared/trash-entry';

	let {
		entries,
		/** Hidden when every row shares one project, where the column would repeat itself. */
		showProject = true,
		emptyTitle = 'The trash is empty',
		emptyHint = 'Notes and diagrams you move to the trash land here, and can be restored from it.',
		onrestore,
		ondelete,
		onempty
	}: {
		entries: readonly TrashEntry[];
		showProject?: boolean;
		emptyTitle?: string;
		emptyHint?: string;
		/**
		 * Given the whole entry, not an id: the caller narrows on `kind` once and
		 * calls the command that matches. Passing a bare id would make every caller
		 * re-derive which kind it was holding.
		 */
		onrestore: (entry: TrashEntry) => Promise<void>;
		/** Omitted where permanent deletion is not offered; the row then only restores. */
		ondelete?: (entry: TrashEntry) => Promise<void>;
		onempty?: () => Promise<void>;
	} = $props();

	let restoringKey = $state<string | undefined>(undefined);
	let deletingKey = $state<string | undefined>(undefined);
	let emptying = $state(false);

	const busy = $derived(restoringKey !== undefined || deletingKey !== undefined || emptying);

	async function restore(entry: TrashEntry): Promise<void> {
		restoringKey = trashEntryKey(entry);
		try {
			await onrestore(entry);
		} finally {
			restoringKey = undefined;
		}
	}

	async function remove(entry: TrashEntry): Promise<void> {
		deletingKey = trashEntryKey(entry);
		try {
			await ondelete?.(entry);
		} finally {
			deletingKey = undefined;
		}
	}

	async function empty(): Promise<void> {
		emptying = true;
		try {
			await onempty?.();
		} finally {
			emptying = false;
		}
	}

	/** Named so the confirmation says what is about to go, contents included. */
	function deleteDescription(entry: TrashEntry): string {
		return entry.kind === 'folder'
			? `“${entry.title}” and any notes inside it will be deleted permanently. This cannot be undone.`
			: `“${entry.title}” will be deleted permanently. This cannot be undone.`;
	}
</script>

{#if entries.length === 0}
	<EmptyState icon={FtTrash} title={emptyTitle} hint={emptyHint} size="large" label="Empty trash" />
{:else}
	{#if onempty}
		<div class="flex justify-end pb-2">
			<ConfirmDelete
				title="Empty the trash?"
				description="Everything in the trash will be deleted permanently. This cannot be undone."
				confirmLabel="Empty trash"
				busy={emptying}
				onconfirm={empty}
			>
				{#snippet trigger(props)}
					<Button {...props} variant="ghost" size="sm" class="text-destructive" disabled={busy}>
						{#if emptying}<Spinner data-icon="inline-start" />{/if}
						Empty trash
					</Button>
				{/snippet}
			</ConfirmDelete>
		</div>
	{/if}
	<ul class="divide-y divide-border" aria-label="Items in the trash">
		{#each entries as entry (trashEntryKey(entry))}
			{@const Icon = trashEntryIcon(entry)}
			{@const key = trashEntryKey(entry)}
			<li class="flex items-center justify-between gap-3 py-2.5">
				<!--
					The icon is decorative: the kind is already written in the line beneath,
					so a screen reader that announced both would say "Diagram" twice.
				-->
				<Icon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{entry.title}</p>
					<p class="truncate text-xs text-muted-foreground">
						{#if showProject}{entry.projectName} ·
						{/if}{trashEntryLabel(entry)} · Trashed {formatRelativeTime(entry.archivedAt)}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-1">
					<Button variant="outline" size="sm" disabled={busy} onclick={() => void restore(entry)}>
						{#if restoringKey === key}<Spinner data-icon="inline-start" />{/if}
						Restore
					</Button>
					{#if ondelete}
						<ConfirmDelete
							title="Delete this {trashEntryLabel(entry).toLowerCase()} forever?"
							description={deleteDescription(entry)}
							confirmLabel="Delete forever"
							busy={deletingKey === key}
							onconfirm={() => remove(entry)}
						>
							{#snippet trigger(props)}
								<Button
									{...props}
									variant="ghost"
									size="sm"
									class="text-muted-foreground hover:text-destructive"
									disabled={busy}
									aria-label="Delete {entry.title} forever"
								>
									{#if deletingKey === key}<Spinner />{:else}<FtTrash class="size-4" />{/if}
								</Button>
							{/snippet}
						</ConfirmDelete>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
