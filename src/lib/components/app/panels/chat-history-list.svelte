<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Conversation, ShellContext } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import NameDialog from '$lib/components/app/name-dialog.svelte';
	import { deleteSession, renameSession } from '$lib/remote/chat.remote';
	import { toast } from 'svelte-sonner';

	let {
		sessions,
		shell,
		onselect
	}: {
		sessions: readonly Conversation[];
		shell?: ShellContext;
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
		busy = true;
		try {
			await deleteSession({ conversationId: selected.id });
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

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between px-1">
		<h3 class="provenance-caption">Recent chats</h3>
		<Button variant="link" size="sm"><a href="/chats">All chats</a></Button>
	</div>
	{#if sessions.length === 0}
		<p class="px-1 text-sm text-muted-foreground">No past conversations yet.</p>
	{:else}
		{#each sessions.slice(0, 5) as session (session.id)}
			<div class="group flex min-w-0 items-center gap-1">
				<Button
					variant="ghost"
					class="h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-2.5"
					onclick={() => onselect(session.id)}
				>
					<MessageSquare data-icon="inline-start" />
					<span class="flex min-w-0 flex-col items-start gap-0.5">
						<span class="w-full truncate text-left text-sm">{session.title ?? 'New conversation'}</span>
						<span class="w-full truncate text-left text-xs text-muted-foreground">{origin(session)}</span>
					</span>
				</Button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {session.title ?? 'chat'}">
								<MoreHorizontal />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Group>
							<DropdownMenu.Item>
								<a class="flex w-full items-center gap-2" href="/chats/{session.id}" target="_blank" rel="noreferrer">
									<ExternalLink /> Open in new tab
								</a>
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { selected = session; renameOpen = true; }}>
								<Pencil /> Rename
							</DropdownMenu.Item>
							<DropdownMenu.Item variant="destructive" onclick={() => { selected = session; deleteOpen = true; }}>
								<Trash2 /> Delete
							</DropdownMenu.Item>
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/each}
	{/if}
</div>

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
