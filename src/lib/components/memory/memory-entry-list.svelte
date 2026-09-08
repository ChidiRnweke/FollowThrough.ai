<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
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
	import { newMemory, memoryWrite } from '$lib/models/workspace-mutations';
	import { workspaceResourceKey } from '$lib/models/workspace-sync';
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
	import type { DateTime } from '$lib/models/workspace';
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

	const resources = $derived(workspaceSession.current?.resources);
	const entries = $derived(resources?.views.memories(projectId) ?? []);
	const pending = $derived(resources?.views.memorySuggestions(projectId) ?? []);
	let loadError = $state<string | null>(null);
	let loading = $state(false);
	let busyIds = $state<SuggestionId[]>([]);
	let draft = $state('');
	let draftType = $state<MemoryEntryType | 'none'>('none');
	const entryTypes: MemoryEntryType[] = ['fact', 'decision', 'constraint', 'preference'];
	let editing = $state<{ resource: WorkspaceDraft<'memory_entries'>; content: string } | null>(
		null
	);
	let deletion = $state<WorkspaceDraft<'memory_entries'> | null>(null);
	let addOpen = $state(false);
	let adding = $state(false);

	function editorFor(entry: MemoryEntry): WorkspaceDraft<'memory_entries'> {
		if (!resources) throw new Error('Open the workspace before editing memory');
		const resource = resources.draft({ type: 'memory_entries', id: [entry.id] });
		resource.capture();
		return resource;
	}
	function askDelete(entry: MemoryEntry): void {
		deletion = editorFor(entry);
	}
	async function confirmDelete(): Promise<void> {
		const resource = deletion;
		const entry = resource?.value;
		if (!resource || !entry) return;
		const result = await resource.stage({
			command: { kind: 'deleteMemory', memoryEntryId: entry.id },
			local: null,
			coalesce: null,
			references: []
		});
		if (result.kind === 'failure') toast.error(result.message);
		else if (deletion === resource) deletion = null;
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
		if (!resources) return;
		loading = true;
		void resources
			.prepare(['memory_entries', 'suggestions', 'source_anchors', 'provenance'])
			.catch((error) => {
				loadError = error instanceof Error ? error.message : 'Could not load memory';
				return { kind: 'failure', message: loadError };
			})
			.finally(() => {
				loading = false;
			});
	});

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

			await workspaceSession.synchronize();
			toast.success('Memory accepted.');
			// audit-allow: silent-catch — acceptance failure is reported and the suggestion remains pending.
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
			await workspaceSession.synchronize();
			toast.success('Memory suggestion dismissed.');
			// audit-allow: silent-catch — dismissal failure is reported and the suggestion remains pending.
		} catch {
			toast.error('Could not dismiss the memory suggestion.');
		} finally {
			busyIds = busyIds.filter((busyId) => busyId !== id);
		}
	}

	async function add(): Promise<boolean> {
		const content = draft.trim();
		if (!content || adding) return false;
		adding = true;
		try {
			const session = workspaceSession.current;
			if (!session) throw new Error('Open the workspace before adding memory');
			const entry = newMemory(
				crypto.randomUUID() as MemoryEntryId,
				session.shell.user.id,
				{
					projectId,
					content,
					...(draftType !== 'none' ? { type: draftType } : {})
				},
				new Date().toISOString() as DateTime
			);
			await session.resources.append({
				operationId: crypto.randomUUID(),
				key: workspaceResourceKey({ type: 'memory_entries', id: [entry.id] }),
				command: {
					kind: 'createMemory',
					id: entry.id,
					projectId,
					content: entry.content,
					type: entry.type,
					shareWithAgents: entry.shareWithAgents
				},
				base: null,
				basedOn: null,
				local: { type: 'memory_entries', value: entry },
				coalesce: null,
				references: projectId ? [workspaceResourceKey({ type: 'projects', id: [projectId] })] : []
			});
			draft = '';
			draftType = 'none';
			return true;
			// audit-allow: silent-catch — false is the dialog's typed save outcome and the toast explains that the dialog must stay open.
		} catch {
			toast.error('Could not save the memory entry.');
			return false;
		} finally {
			adding = false;
		}
	}

	async function submitAdd(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		// On failure the dialog stays open so the draft can be corrected.
		if (await add()) addOpen = false;
	}

	async function saveEdit(): Promise<void> {
		const edit = editing;
		const entry = edit?.resource.value;
		if (!edit || !entry) return;
		const content = edit.content.trim();
		if (!content) return;
		const result = await edit.resource.stage(memoryWrite(entry, { content }));
		if (result.kind === 'failure') toast.error(result.message);
		else if (editing === edit && edit.content.trim() === content) editing = null;
	}

	async function toggleShare(entry: MemoryEntry, shareWithAgents: boolean): Promise<void> {
		const resource = editorFor(entry);
		const result = await resource.stage(memoryWrite(entry, { shareWithAgents }));
		if (result.kind === 'failure') toast.error(result.message);
	}
</script>

<!-- Adding is an occasional act, so it sits behind a CTA and a dialog instead of an
     always-on composer competing with what is already remembered. The spacing ladder:
     a 24px step between the action row and the sections, 8px inside each section. -->
<div class="flex h-full min-h-0 flex-col gap-6">
	{#if loadError}<p role="alert">{loadError}</p>{:else if loading && isEmpty}
		<p class="text-sm text-muted-foreground">Loading memory…</p>
	{:else if isEmpty && resources?.availability !== 'complete'}<p role="status">
			Memory data is not fully available on this device yet.
		</p>{:else if isEmpty}
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
		{#if editing && editing.resource.identity.id[0] === entry.id}
			<div class="flex flex-col gap-2">
				<Textarea bind:value={editing.content} rows={3} aria-label="Edit memory entry" />
				<div class="flex justify-end gap-2">
					<Button size="sm" variant="ghost" onclick={() => (editing = null)}>Cancel</Button>
					<Button size="sm" disabled={!editing.content.trim()} onclick={() => saveEdit()}>
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
									editing = { resource: editorFor(entry), content: entry.content };
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

<AlertDialog.Root
	open={deletion !== null}
	onOpenChange={(open) => {
		if (!open) deletion = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this memory?</AlertDialog.Title>
			<AlertDialog.Description>
				The agent will no longer remember this. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button
				variant="destructive"
				disabled={deletion?.status === 'saving'}
				onclick={() => void confirmDelete()}
			>
				Delete
			</Button>
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
			<Textarea
				bind:value={draft}
				disabled={adding}
				{placeholder}
				rows={3}
				aria-label="New memory entry"
				autofocus
			/>
			<div class="flex items-center justify-between gap-2">
				<Select.Root
					type="single"
					disabled={adding}
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
					<Button type="submit" disabled={adding || !draft.trim()}>Add memory</Button>
				</div>
			</div>
		</Form>
	</Dialog.Content>
</Dialog.Root>
