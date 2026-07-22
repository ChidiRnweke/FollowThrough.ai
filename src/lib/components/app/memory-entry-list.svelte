<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type {
		MemoryEntry,
		MemoryEntryId,
		MemorySuggestionView,
		ProjectId,
		SuggestionId
	} from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { toast } from 'svelte-sonner';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';
	import {
		getEntries,
		getPendingSuggestions,
		createEntry,
		updateEntry,
		deleteEntry
	} from '$lib/remote/memory.remote';
	import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions.remote';
	import { formatRelativeTime } from './labels';

	let {
		projectId,
		placeholder,
		emptyText,
		hideShare = false,
		scopeLabel
	}: {
		/** Omit for the user's profile memory. */
		projectId?: ProjectId;
		placeholder: string;
		emptyText: string;
		/** Profile memory is always shared, so hide the per-entry toggle. */
		hideShare?: boolean;
		/** Optional caption clarifying where these memories apply. */
		scopeLabel?: string;
	} = $props();

	let entries = $state<MemoryEntry[]>([]);
	let pending = $state<MemorySuggestionView[]>([]);
	let loading = $state(false);
	let busyIds = $state<SuggestionId[]>([]);
	let draft = $state('');
	let editingId = $state<MemoryEntryId | undefined>(undefined);
	let editingContent = $state('');
	let deleteTarget = $state<MemoryEntry | undefined>(undefined);
	let deleteOpen = $state(false);

	function askDelete(entry: MemoryEntry): void {
		deleteTarget = entry;
		deleteOpen = true;
	}

	async function confirmDelete(): Promise<void> {
		if (deleteTarget) await remove(deleteTarget);
		deleteOpen = false;
		deleteTarget = undefined;
	}
	const items = $derived.by(() =>
		[
			...pending.map((view) => ({ kind: 'pending' as const, view, at: view.suggestion.createdAt })),
			...entries.map((entry) => ({ kind: 'saved' as const, entry, at: entry.updatedAt }))
		].sort((a, b) => b.at.localeCompare(a.at))
	);

	$effect(() => {
		void load(projectId);
	});

	async function load(id: ProjectId | undefined): Promise<void> {
		loading = true;
		try {
			const [saved, proposed] = await Promise.all([getEntries(id), getPendingSuggestions(id)]);
			entries = [...saved.entries];
			pending = [...proposed.suggestions];
		} catch {
			toast.error('Could not load memory.');
		} finally {
			loading = false;
		}
	}

	function proposalContent(view: MemorySuggestionView): string {
		const suggestion = view.suggestion;
		if (suggestion.payload.content) return suggestion.payload.content;
		const target = entries.find((entry) => entry.id === suggestion.payload.memoryEntryId);
		return target?.content ?? 'Remove this remembered item';
	}

	async function accept(view: MemorySuggestionView): Promise<void> {
		const id = view.suggestion.id;
		busyIds = [...busyIds, id];
		try {
			const output = await acceptSuggestion({ suggestionId: id });
			if (output.suggestion.kind !== 'memory') throw new Error('Expected a memory suggestion');
			pending = pending.filter((item) => item.suggestion.id !== id);
			const targetId = output.suggestion.payload.memoryEntryId;
			const remaining = targetId ? entries.filter((entry) => entry.id !== targetId) : entries;
			entries =
				output.suggestion.payload.operation === 'remove'
					? remaining
					: [output.artifact as MemoryEntry, ...remaining];
			await invalidateAll();
			toast.success('Memory accepted.');
		} catch {
			toast.error('Could not accept the memory suggestion.');
		} finally {
			busyIds = busyIds.filter((busyId) => busyId !== id);
		}
	}

	async function dismiss(view: MemorySuggestionView): Promise<void> {
		const id = view.suggestion.id;
		busyIds = [...busyIds, id];
		try {
			await rejectSuggestion({ suggestionId: id });
			pending = pending.filter((item) => item.suggestion.id !== id);
			await invalidateAll();
			toast.success('Memory suggestion dismissed.');
		} catch {
			toast.error('Could not dismiss the memory suggestion.');
		} finally {
			busyIds = busyIds.filter((busyId) => busyId !== id);
		}
	}

	async function add(): Promise<void> {
		const content = draft.trim();
		if (!content) return;
		try {
			const { entry } = await createEntry({ projectId, content });
			entries = [entry, ...entries];
			draft = '';
		} catch {
			toast.error('Could not save the memory entry.');
		}
	}

	async function saveEdit(entry: MemoryEntry): Promise<void> {
		const content = editingContent.trim();
		if (!content) return;
		const previous = entries;
		entries = entries.map((item) => (item.id === entry.id ? { ...item, content } : item));
		editingId = undefined;
		try {
			await updateEntry({ memoryEntryId: entry.id, content });
		} catch {
			entries = previous;
			toast.error('Could not update the memory entry.');
		}
	}

	async function toggleShare(entry: MemoryEntry, shareWithAgents: boolean): Promise<void> {
		const previous = entries;
		entries = entries.map((item) => (item.id === entry.id ? { ...item, shareWithAgents } : item));
		try {
			await updateEntry({ memoryEntryId: entry.id, shareWithAgents });
		} catch {
			entries = previous;
			toast.error('Could not update the memory entry.');
		}
	}

	async function remove(entry: MemoryEntry): Promise<void> {
		const previous = entries;
		entries = entries.filter((item) => item.id !== entry.id);
		try {
			await deleteEntry({ memoryEntryId: entry.id });
		} catch {
			entries = previous;
			toast.error('Could not delete the memory entry.');
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col gap-3">
	<div class="flex flex-col gap-2">
		<Textarea bind:value={draft} {placeholder} rows={2} aria-label="New memory entry" />
		<div class="flex items-center justify-between gap-2">
			{#if scopeLabel}
				<span class="text-xs text-muted-foreground">{scopeLabel}</span>
			{:else}
				<span></span>
			{/if}
			<Button size="sm" disabled={!draft.trim()} onclick={add}>
				<Plus data-icon />
				Add memory
			</Button>
		</div>
	</div>
	{#if loading && items.length === 0}
		<p class="text-sm text-muted-foreground">Loading memory…</p>
	{:else if items.length === 0}
		<p class="text-sm text-muted-foreground">{emptyText}</p>
	{:else}
		<ul
			class="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border"
		>
			{#each items as item (item.kind === 'pending' ? `pending-${item.view.suggestion.id}` : `saved-${item.entry.id}`)}
				<li class="px-3 py-2.5">
					{#if item.kind === 'pending'}
						{@const view = item.view}
						{@const suggestion = view.suggestion}
						{@const busy = busyIds.includes(suggestion.id)}
						<div class="flex items-start gap-3">
							<Checkbox
								checked={false}
								disabled={busy}
								aria-label="Accept memory suggestion"
								onCheckedChange={(checked) => {
									if (checked === true) void accept(view);
								}}
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-1.5">
									<Badge variant="secondary">Suggested</Badge>
									<Badge variant="ghost">{suggestion.payload.operation}</Badge>
								</div>
								<p class="mt-2 text-sm whitespace-pre-wrap">{proposalContent(view)}</p>
								{#if suggestion.payload.justification}
									<p class="mt-1 text-xs text-muted-foreground">
										{suggestion.payload.justification}
									</p>
								{/if}
								<div class="mt-2 flex items-center justify-between gap-2">
									<span class="text-xs text-muted-foreground">
										{formatRelativeTime(suggestion.createdAt)}
									</span>
									<Button
										size="sm"
										variant="ghost"
										disabled={busy}
										onclick={() => void dismiss(view)}
									>
										Dismiss
									</Button>
								</div>
							</div>
						</div>
					{:else if editingId === item.entry.id}
						{@const entry = item.entry}
						<div class="flex flex-col gap-2">
							<Textarea bind:value={editingContent} rows={3} aria-label="Edit memory entry" />
							<div class="flex justify-end gap-2">
								<Button size="sm" variant="ghost" onclick={() => (editingId = undefined)}>
									Cancel
								</Button>
								<Button size="sm" disabled={!editingContent.trim()} onclick={() => saveEdit(entry)}>
									Save
								</Button>
							</div>
						</div>
					{:else}
						{@const entry = item.entry}
						<div class="flex items-start justify-between gap-3">
							<p class="min-w-0 flex-1 text-sm whitespace-pre-wrap">{entry.content}</p>
							<div class="flex shrink-0 items-center gap-1.5">
								<span class="text-xs text-muted-foreground">
									{formatRelativeTime(entry.updatedAt)}
								</span>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button {...props} variant="ghost" size="icon-sm" aria-label="Memory actions">
												<MoreHorizontal data-icon />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item
											onSelect={() => {
												editingId = entry.id;
												editingContent = entry.content;
											}}
										>
											Edit
										</DropdownMenu.Item>
										<DropdownMenu.Item variant="destructive" onSelect={() => askDelete(entry)}>
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						</div>
						{#if !hideShare}
							<Label class="mt-1.5 flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
								<Checkbox
									checked={entry.shareWithAgents}
									aria-label="Share with agents"
									onCheckedChange={(checked) => toggleShare(entry, checked === true)}
								/>
								Share with agents
							</Label>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this memory?</AlertDialog.Title>
			<AlertDialog.Description>
				The agent will no longer remember this. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={() => void confirmDelete()}>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
