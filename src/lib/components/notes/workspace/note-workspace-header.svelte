<script lang="ts">
	import type { Note, NoteId, NoteSummary } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import type { ShellContext } from '$lib/models/workspace';
	import type { NoteSyncStore } from '$lib/stores/notes/note-sync.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { mergeProps } from '$lib/utils';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import {
		FtEllipsis as Ellipsis,
		FtLoader as LoaderCircle,
		FtPin as Pin,
		FtPinOff as PinOff,
		FtExport as FileOutput,
		FtPublish as ArrowUpFromLine,
		FtUndo as Undo2,
		FtHistory as History,
		FtTrash as Trash,
		FtSuggestion as Suggestion,
		FtDocument as FileText,
		FtClose as X
	} from '$lib/components/icons';
	import NoteBreadcrumb from '../note-breadcrumb.svelte';
	import NoteSyncStatus from '../note-sync-status.svelte';

	let {
		shell,
		note,
		projectId,
		noteSync,
		dirty,
		saveFailed,
		unsynced,
		hasUnpublishedChanges,
		activeAction,
		publishing,
		comparable,
		folders,
		onCloseSplit,
		height = $bindable(0),
		ontitle,
		onadvance,
		onreviewconflict,
		onretry,
		onpublish,
		onexport,
		onask,
		oncompare,
		ontogglepin,
		onmove,
		ondiscard,
		onarchive,
		onhistory
	}: {
		shell: ShellContext;
		note: Note;
		projectId: ProjectId;
		noteSync: NoteSyncStore;
		dirty: boolean;
		saveFailed: boolean;
		unsynced: boolean;
		hasUnpublishedChanges: boolean;
		activeAction?: string;
		publishing: boolean;
		comparable: boolean;
		folders: readonly NoteSummary[];
		onCloseSplit?: () => void;
		height?: number;
		ontitle: (title: string) => void;
		onadvance: () => void;
		onreviewconflict: () => void;
		onretry: () => void;
		onpublish: () => void;
		onexport: () => void;
		onask: () => void;
		oncompare: () => void;
		ontogglepin: () => void;
		onmove: (parentId?: NoteId) => void;
		ondiscard: () => void;
		onarchive: () => void;
		/** Opens the version history, which doubles as the draft-versus-published comparison. */
		onhistory: () => void;
	} = $props();
</script>

{#snippet syncStatus()}
	<div class="min-w-0 flex-1 sm:flex-none">
		<NoteSyncStatus
			status={noteSync.status}
			updatedAt={note.updatedAt}
			reason={noteSync.lastError}
			onRetry={onretry}
			onReview={onreviewconflict}
		/>
	</div>
{/snippet}

<div
	class="sticky top-0 z-20 flex min-w-0 flex-col gap-2 border-b border-border bg-background pb-2 @[48rem]:min-h-8 @[48rem]:flex-row @[48rem]:items-center dark:bg-card"
	data-testid="note-utility-header"
	bind:clientHeight={height}
>
	<div class="flex min-w-0 items-center gap-1 @[48rem]:flex-1">
		<div class="min-w-0 flex-1">
			<NoteBreadcrumb {shell} {note} oncommit={ontitle} {onadvance} />
		</div>
		{#if onCloseSplit}
			<Tip text="Close split view">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="size-11 sm:size-8"
						aria-label="Close split view"
						onclick={onCloseSplit}><X /></Button
					>
				{/snippet}
			</Tip>
		{/if}
	</div>
	<div class="flex min-w-0 items-center gap-1 @[48rem]:ml-auto @[48rem]:gap-2">
		{#if activeAction}<LoaderCircle
				class="size-4 animate-spin text-muted-foreground"
				aria-label="AI action running"
			/>{/if}
		{#if dirty && !note.title.trim()}
			<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
				>Add a title to save</span
			>
		{:else if saveFailed}
			<Tip text={noteSync.lastError ?? 'The note could not be saved. Your text is still here.'}>
				{#snippet children({ props })}
					<span
						{...props}
						class="min-w-0 flex-1 text-xs text-destructive sm:flex-none"
						aria-live="polite">Couldn’t save · press Ctrl+S to retry</span
					>
				{/snippet}
			</Tip>
		{:else if unsynced || noteSync.status === 'saving'}
			{@render syncStatus()}
		{:else if dirty}
			<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
				>Unsaved changes</span
			>
		{:else if hasUnpublishedChanges}
			<span class="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
				<span class="text-xs text-muted-foreground" aria-live="polite">Unpublished changes</span>
				{#if note.publishedRevision > 0}
					<Button
						variant="link"
						size="sm"
						class="h-auto p-0 text-xs"
						onclick={onhistory}
						aria-label="View changes since the last published version">View changes</Button
					>
				{/if}
			</span>
		{:else}
			{@render syncStatus()}
		{/if}
		<AgentAction
			action={agentActions.note}
			context={{ noteId: note.id, projectId }}
			class="hidden lg:inline-flex"
		/>
		<Tip text="Publish note (Ctrl+S)">
			{#snippet children({ props })}
				<Button
					{...props}
					variant="outline"
					size="sm"
					class="h-11 sm:h-8"
					disabled={!hasUnpublishedChanges || dirty || publishing}
					aria-label="Publish note (Ctrl+S, S)"
					onclick={onpublish}
				>
					{#if publishing}<LoaderCircle class="size-4 animate-spin" />{:else}<ArrowUpFromLine
							class="size-4"
						/>{/if}
					Publish
				</Button>
			{/snippet}
		</Tip>
		<Tip text="Export document">
			{#snippet children({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					class="hidden sm:inline-flex"
					aria-label="Export document"
					onclick={onexport}><FileOutput class="size-4" /></Button
				>
			{/snippet}
		</Tip>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props: menuProps })}
					<Tip text="Note actions">
						{#snippet children({ props: tipProps })}
							<Button
								{...mergeProps(menuProps, tipProps)}
								variant="ghost"
								size="icon-sm"
								class="size-11 sm:size-8"
								aria-label="Note actions"><Ellipsis /></Button
							>
						{/snippet}
					</Tip>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item class="lg:hidden" onclick={onask}
					><Suggestion data-icon="inline-start" />{agentActions.note.label}</DropdownMenu.Item
				>
				{#if comparable}<DropdownMenu.Item onclick={oncompare}
						><FileText data-icon="inline-start" />{agentActions.noteCompare
							.label}</DropdownMenu.Item
					>{/if}
				<DropdownMenu.Separator class={comparable ? '' : 'lg:hidden'} />
				<DropdownMenu.Item class="sm:hidden" onclick={onexport}
					><FileOutput data-icon="inline-start" />Export document</DropdownMenu.Item
				>
				<DropdownMenu.Separator class="sm:hidden" />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={ontogglepin}>
						{#if note.isPinned}<PinOff data-icon="inline-start" />Unpin{:else}<Pin
								data-icon="inline-start"
							/>Pin to sidebar{/if}
					</DropdownMenu.Item>
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>Move to</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							<DropdownMenu.Group>
								<DropdownMenu.Item
									disabled={note.parentId === undefined}
									onclick={() => onmove(undefined)}>Project root</DropdownMenu.Item
								>
								{#each folders as folder (folder.id)}
									<DropdownMenu.Item
										disabled={folder.id === note.parentId}
										onclick={() => onmove(folder.id)}>{folder.title}</DropdownMenu.Item
									>
								{/each}
							</DropdownMenu.Group>
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={onhistory}
						><History data-icon="inline-start" />Version history</DropdownMenu.Item
					>
					<DropdownMenu.Item
						disabled={note.publishedRevision === 0 || !hasUnpublishedChanges}
						onclick={ondiscard}><Undo2 data-icon="inline-start" />Discard changes</DropdownMenu.Item
					>
					<DropdownMenu.Item variant="destructive" onclick={onarchive}
						><Trash data-icon="inline-start" />Move to trash</DropdownMenu.Item
					>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
