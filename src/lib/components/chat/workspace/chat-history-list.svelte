<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { Conversation } from '$lib/models/agent';
	import type { ShellContext } from '$lib/models/workspace';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import {
		FtChat as MessageSquare,
		FtEllipsis as MoreHorizontal,
		FtExternal as ExternalLink,
		FtTrash as Trash2,
		FtEdit as Pencil
	} from '$lib/components/icons';
	import NameDialog from '$lib/components/projects/name-dialog.svelte';
	import { deleteSession, renameSession } from '$lib/remote/agent/chat.remote';
	import { toast } from 'svelte-sonner';
	import { chat } from '$lib/stores/agent/chat.svelte';
	import { formatRelativeTime } from '$lib/components/shared/labels';

	let {
		sessions,
		shell,
		limit = 5,
		showAllLink = true,
		density = 'full',
		onselect
	}: {
		sessions: readonly Conversation[];
		shell?: ShellContext;
		limit?: number;
		showAllLink?: boolean;
		/**
		 * `compact` is the docked panel: one line per chat, title and time only.
		 * Origin is dropped there because it almost always names the scope the
		 * user is already in; `/chats` keeps the full three-line row where the
		 * provenance is the reason to look.
		 */
		density?: 'full' | 'compact';
		onselect: (id: Conversation['id']) => void;
	} = $props();

	let selected = $state<Conversation | undefined>();
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	let busy = $state(false);

	const origin = (session: Conversation): string => {
		const note = shell?.noteTree.find((item) => item.id === session.contextNoteId);
		const project = shell?.projects.find(
			(item) => item.id === (session.contextProjectId ?? note?.projectId)
		);
		if (project && note) return `${project.name} › ${note.title}`;
		if (project) return project.name;
		if (session.contextNoteId) return 'Original note unavailable';
		return 'Workspace chat';
	};

	async function rename(title: string): Promise<void> {
		if (!selected) return;
		busy = true;
		try {
			await renameSession({ conversationId: selected.id, title });
			await invalidateAll();
			toast.success('Chat renamed.');
		} catch {
			toast.error('Chat could not be renamed.');
		} finally {
			busy = false;
		}
	}

	async function remove(): Promise<void> {
		if (!selected) return;
		if (chat.isStreaming && chat.conversationId === selected.id) {
			toast.error('Stop the active generation before deleting this chat.');
			return;
		}
		busy = true;
		try {
			await deleteSession({ conversationId: selected.id });
			if (chat.conversationId === selected.id) {
				chat.clear();
				if (location.pathname === `/chats/${selected.id}`) await goto('/chats/new');
			}
			await invalidateAll();
			deleteOpen = false;
			toast.success('Chat deleted.');
		} catch {
			toast.error('Chat could not be deleted. Stop its active run and try again.');
		} finally {
			busy = false;
		}
	}
</script>

{#snippet actions(session: Conversation)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label="Actions for {session.title ?? 'chat'}"
				>
					<MoreHorizontal />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Group>
				<DropdownMenu.Item
					onclick={() => window.open(`/chats/${session.id}`, '_blank', 'noopener,noreferrer')}
				>
					<ExternalLink /> Open in new tab
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onclick={() => {
						selected = session;
						renameOpen = true;
					}}
				>
					<Pencil /> Rename
				</DropdownMenu.Item>
				<DropdownMenu.Item
					variant="destructive"
					onclick={() => {
						selected = session;
						deleteOpen = true;
					}}
				>
					<Trash2 /> Delete
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#if density === 'compact'}
	<!--
		One line per chat, rules dropped to match the starters above. Three-line rows
		put twenty lines of history under an empty thread and pushed the starters off
		screen. The uppercase eyebrow stays here where the starters lost theirs: down
		at the foot of the panel this group is meant to recede, not compete.
	-->
	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between gap-2 px-2">
			<h3 class="eyebrow">Recent</h3>
			{#if showAllLink}<Button variant="link" size="sm" href="/chats">All chats</Button>{/if}
		</div>
		{#if sessions.length === 0}
			<p class="px-2 text-sm text-muted-foreground">No past conversations yet.</p>
		{:else}
			<ul class="flex flex-col">
				{#each sessions.slice(0, limit) as session (session.id)}
					<li class="group relative">
						<Button
							variant="ghost"
							type="button"
							class="row-interactive flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm"
							onclick={() => onselect(session.id)}
						>
							<span class="min-w-0 flex-1 truncate">{session.title ?? 'New conversation'}</span>
							<!-- Hidden while the row is hovered so the menu can take its place
							     without the row reflowing under the pointer. -->
							<span
								class="provenance-caption shrink-0 group-hover:invisible group-focus-within:invisible"
							>
								{formatRelativeTime(session.updatedAt)}
							</span>
						</Button>
						<div
							class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-(--duration-micro) group-hover:opacity-100 group-focus-within:opacity-100 has-data-[state=open]:opacity-100"
						>
							{@render actions(session)}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between px-1">
			<h3 class="provenance-caption">Recent chats</h3>
			{#if showAllLink}<Button variant="link" size="sm" href="/chats">All chats</Button>{/if}
		</div>
		{#if sessions.length === 0}
			<p class="px-1 text-sm text-muted-foreground">No past conversations yet.</p>
		{:else}
			{#each sessions.slice(0, limit) as session (session.id)}
				<div class="group flex min-w-0 items-center gap-1">
					<Button
						variant="ghost"
						class="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-2.5"
						onclick={() => onselect(session.id)}
					>
						<MessageSquare data-icon="inline-start" />
						<span class="flex min-w-0 flex-col items-start gap-0.5">
							<span class="w-full truncate text-left text-sm"
								>{session.title ?? 'New conversation'}</span
							>
							<!-- Origin is project identity, so it carries the brand accent while
							     the timestamp below stays muted. -->
							<span class="w-full truncate text-left text-xs text-brand">{origin(session)}</span>
							<span class="text-left text-xs text-muted-foreground"
								>{formatRelativeTime(session.updatedAt)}</span
							>
						</span>
					</Button>
					{@render actions(session)}
				</div>
			{/each}
		{/if}
	</div>
{/if}

<NameDialog
	bind:open={renameOpen}
	title="Rename chat"
	label="Chat title"
	initialValue={selected?.title ?? ''}
	{busy}
	onsubmit={rename}
/>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this chat?</AlertDialog.Title>
			<AlertDialog.Description>
				This permanently removes the transcript and its agent run history. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" disabled={busy} onclick={() => void remove()}>
				Delete chat
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
