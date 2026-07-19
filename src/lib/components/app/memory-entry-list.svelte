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
	import { toast } from 'svelte-sonner';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
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
		emptyText
	}: {
		/** Omit for the user's profile memory. */
		projectId?: ProjectId;
		placeholder: string;
		emptyText: string;
	} = $props();

	let entries = $state<MemoryEntry[]>([]);
	let pending = $state<MemorySuggestionView[]>([]);
	let loading = $state(false);
	let busyIds = $state<SuggestionId[]>([]);
	let draft = $state('');
	let editingId = $state<MemoryEntryId | undefined>(undefined);
	let editingContent = $state('');
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
		<Textarea bind:value={draft} {placeholder} rows={3} aria-label="New memory entry" />
		<Button size="sm" class="self-end" disabled={!draft.trim()} onclick={add}>
			<Plus data-icon />
			Add memory
		</Button>
	</div>
	{#if loading && items.length === 0}
		<p class="text-sm text-muted-foreground">Loading memory…</p>
	{:else if items.length === 0}
		<p class="text-sm text-muted-foreground">{emptyText}</p>
	{:else}
		<ul class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
			{#each items as item (item.kind === 'pending' ? `pending-${item.view.suggestion.id}` : `saved-${item.entry.id}`)}
				<li class="rounded-md border border-border p-3">
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
						<p class="text-sm whitespace-pre-wrap">{entry.content}</p>
						<div class="mt-2 flex items-center justify-between gap-2">
							<Label class="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Checkbox
									checked={entry.shareWithAgents}
									aria-label="Share with agents"
									onCheckedChange={(checked) => toggleShare(entry, checked === true)}
								/>
								Share with agents
							</Label>
							<div class="flex items-center gap-1">
								<span class="text-xs text-muted-foreground">
									{formatRelativeTime(entry.updatedAt)}
								</span>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Edit memory entry"
									onclick={() => {
										editingId = entry.id;
										editingContent = entry.content;
									}}
								>
									<Pencil data-icon />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Delete memory entry"
									onclick={() => remove(entry)}
								>
									<Trash2 data-icon />
								</Button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
