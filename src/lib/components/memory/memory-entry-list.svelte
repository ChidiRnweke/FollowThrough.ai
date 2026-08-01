<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import { invalidateAll } from '$app/navigation';
	import type {
		MemoryEntry,
		MemoryEntryId,
		MemoryEntryType,
		MemorySuggestionView
	} from '$lib/models/memory';
	import type { ProjectId } from '$lib/models/projects';
	import type { SuggestionId } from '$lib/models/suggestions';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from 'svelte-sonner';
	import {
		FtEllipsis as MoreHorizontal,
		FtMemory as Brain,
		FtPlus as Plus
	} from '$lib/components/icons';
	import EmptyState from '../shared/empty-state.svelte';
	import {
		getEntries,
		getPendingSuggestions,
		createEntry,
		updateEntry,
		deleteEntry
	} from '$lib/remote/memory/memory.remote';
	import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';
	import { formatRelativeTime, memoryEntryTypeLabels } from '../shared/labels';

	let {
		projectId,
		placeholder,
		emptyText,
		emptyHint,
		hideShare = false,
		scopeLabel,
		heroEmpty = false
	}: {
		/** Omit for the user's profile memory. */
		projectId?: ProjectId;
		placeholder: string;
		emptyText: string;
		/** Second line of the empty state — the invitation, kept out of the voice line. */
		emptyHint?: string;
		/** Profile memory is always shared, so hide the per-entry toggle. */
		hideShare?: boolean;
		/** Optional caption clarifying where these memories apply. */
		scopeLabel?: string;
		/** Whole-page contexts (the profile and project memory pages) get the
		 *  hero-sized empty state; slots and panels keep the quiet one. */
		heroEmpty?: boolean;
	} = $props();

	let entries = $state<MemoryEntry[]>([]);
	let pending = $state<MemorySuggestionView[]>([]);
	let loading = $state(false);
	let busyIds = $state<SuggestionId[]>([]);
	let draft = $state('');
	let draftType = $state<MemoryEntryType | 'none'>('none');
	const entryTypes: MemoryEntryType[] = ['fact', 'decision', 'constraint', 'preference'];
	let editingId = $state<MemoryEntryId | undefined>(undefined);
	let editingContent = $state('');
	let deleteTarget = $state<MemoryEntry | undefined>(undefined);
	let deleteOpen = $state(false);
	let addOpen = $state(false);

	function askDelete(entry: MemoryEntry): void {
		deleteTarget = entry;
		deleteOpen = true;
	}

	async function confirmDelete(): Promise<void> {
		if (deleteTarget) await remove(deleteTarget);
		deleteOpen = false;
		deleteTarget = undefined;
	}
	// Proposals and kept entries are different in kind — one asks for a decision,
	// the other is the record — so each gets its own section instead of the two
	// interleaving in one time-sorted list where every row had to be re-parsed.
	const pendingItems = $derived(
		[...pending].sort((a, b) => b.suggestion.createdAt.localeCompare(a.suggestion.createdAt))
	);
	const savedItems = $derived([...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
	const isEmpty = $derived(pendingItems.length === 0 && savedItems.length === 0);

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

	async function add(): Promise<boolean> {
		const content = draft.trim();
		if (!content) return false;
		try {
			const { entry } = await createEntry({
				projectId,
				content,
				...(draftType !== 'none' ? { type: draftType } : {})
			});
			entries = [entry, ...entries];
			draft = '';
			draftType = 'none';
			return true;
		} catch {
			toast.error('Could not save the memory entry.');
			return false;
		}
	}

	async function submitAdd(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		// On failure the dialog stays open so the draft can be corrected.
		if (await add()) addOpen = false;
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

<!-- Adding is an occasional act, so it sits behind a CTA and a dialog instead of an
     always-on composer competing with what is already remembered. The spacing ladder:
     a 24px step between the action row and the sections, 8px inside each section. -->
<div class="flex h-full min-h-0 flex-col gap-6">
	{#if loading && isEmpty}
		<p class="text-sm text-muted-foreground">Loading memory…</p>
	{:else if isEmpty}
		<!-- Whole-page contexts (profile, project memory) get the hero-sized shared
		     EmptyState; the side panel keeps the slot size. -->
		<EmptyState
			icon={Brain}
			title={emptyText}
			hint={emptyHint}
			size={heroEmpty ? 'large' : 'default'}
			label={heroEmpty ? 'Empty memory' : undefined}
		>
			{#snippet action()}
				{@render addButton()}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex justify-end">
			{@render addButton()}
		</div>
		<!-- Proposals first, then what is kept: the two are different in kind, and the
		     24px step between the sections is what says so. Both lists are homogeneous
		     rows, so divided borderless lists rather than bordered boxes — nesting
		     same-weight rectangles is the failure the surface rule exists to prevent. -->
		<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
			{#if pendingItems.length > 0}
				<section class="flex flex-col gap-2">
					<h2 class="eyebrow">Suggested by the agent</h2>
					<ul class="divide-y divide-border">
						{#each pendingItems as view (view.suggestion.id)}
							{@render pendingRow(view)}
						{/each}
					</ul>
				</section>
			{/if}
			{#if savedItems.length > 0}
				<section class="flex flex-col gap-2">
					<h2 class="eyebrow">Remembered · {savedItems.length}</h2>
					<ul class="divide-y divide-border">
						{#each savedItems as entry (entry.id)}
							{@render savedRow(entry)}
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/if}
</div>

{#snippet addButton()}
	<Button size="sm" onclick={() => (addOpen = true)}>
		<Plus data-icon />
		Add memory
	</Button>
{/snippet}

{#snippet pendingRow(view: MemorySuggestionView)}
	{@const suggestion = view.suggestion}
	{@const busy = busyIds.includes(suggestion.id)}
	<li class="row-interactive px-3 py-2.5">
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
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => void dismiss(view)}>
						Dismiss
					</Button>
				</div>
			</div>
		</div>
	</li>
{/snippet}

{#snippet savedRow(entry: MemoryEntry)}
	<li class="row-interactive px-3 py-2.5">
		{#if editingId === entry.id}
			<div class="flex flex-col gap-2">
				<Textarea bind:value={editingContent} rows={3} aria-label="Edit memory entry" />
				<div class="flex justify-end gap-2">
					<Button size="sm" variant="ghost" onclick={() => (editingId = undefined)}>Cancel</Button>
					<Button size="sm" disabled={!editingContent.trim()} onclick={() => saveEdit(entry)}>
						Save
					</Button>
				</div>
			</div>
		{:else}
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					{#if entry.type}
						<Badge variant="ghost" class="mb-1 text-muted-foreground"
							>{memoryEntryTypeLabels[entry.type]}</Badge
						>
					{/if}
					<p class="text-sm whitespace-pre-wrap">{entry.content}</p>
				</div>
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
{/snippet}

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

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add a memory</Dialog.Title>
			{#if scopeLabel}
				<Dialog.Description>{scopeLabel}</Dialog.Description>
			{/if}
		</Dialog.Header>
		<Form class="flex flex-col gap-4" onsubmit={submitAdd}>
			<Textarea bind:value={draft} {placeholder} rows={3} aria-label="New memory entry" autofocus />
			<div class="flex items-center justify-between gap-2">
				<Select.Root
					type="single"
					value={draftType}
					onValueChange={(next) => (draftType = next as MemoryEntryType | 'none')}
				>
					<Select.Trigger size="sm" aria-label="Memory type">
						{draftType === 'none' ? 'No type' : memoryEntryTypeLabels[draftType]}
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							<Select.Item value="none">No type</Select.Item>
							{#each entryTypes as entryType (entryType)}
								<Select.Item value={entryType}>{memoryEntryTypeLabels[entryType]}</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
				<div class="flex items-center gap-2">
					<Button type="button" variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button>
					<Button type="submit" disabled={!draft.trim()}>Add memory</Button>
				</div>
			</div>
		</Form>
	</Dialog.Content>
</Dialog.Root>
