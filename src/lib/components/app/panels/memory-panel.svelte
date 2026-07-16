<script lang="ts">
	import type { MemoryEntry, MemoryEntryId } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { getEntries, createEntry, updateEntry, deleteEntry } from '$lib/remote/memory.remote';
	import { formatRelativeTime } from '../labels';

	let entries = $state<MemoryEntry[]>([]);
	let loading = $state(false);
	let draft = $state('');
	let editingId = $state<MemoryEntryId | undefined>(undefined);
	let editingContent = $state('');

	const projectId = $derived(rightPanel.memoryProjectId);

	$effect(() => {
		if (projectId) void load(projectId);
	});

	async function load(id: string): Promise<void> {
		loading = true;
		try {
			const output = await getEntries(id);
			entries = [...output.entries];
		} catch {
			toast.error('Could not load project memory.');
		} finally {
			loading = false;
		}
	}

	async function add(): Promise<void> {
		const content = draft.trim();
		if (!content || !projectId) return;
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

<div class="flex h-full flex-col gap-3">
	<div class="flex flex-col gap-2">
		<Textarea
			bind:value={draft}
			placeholder="A fact, decision, constraint, or preference worth remembering…"
			rows={3}
			aria-label="New memory entry"
		/>
		<Button size="sm" class="self-end" disabled={!draft.trim()} onclick={add}>
			<Plus data-icon />
			Add memory
		</Button>
	</div>
	{#if loading && entries.length === 0}
		<p class="text-sm text-muted-foreground">Loading project memory…</p>
	{:else if entries.length === 0}
		<p class="text-sm text-muted-foreground">
			Nothing remembered yet. Add durable project facts here, or accept memory suggestions from the
			agent.
		</p>
	{:else}
		<ul class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
			{#each entries as entry (entry.id)}
				<li class="rounded-md border border-border p-3">
					{#if editingId === entry.id}
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
