<script lang="ts">
	import type { Conversation } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Clock from '@lucide/svelte/icons/clock';

	let {
		sessions,
		onselect
	}: {
		sessions: readonly Conversation[];
		onselect: (id: Conversation['id']) => void;
	} = $props();
</script>

<div class="space-y-1">
	<h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
		Recent chats
	</h3>
	{#if sessions.length === 0}
		<p class="text-sm text-muted-foreground px-1">No past conversations yet.</p>
	{:else}
		{#each sessions as session (session.id)}
			<Button
				variant="ghost"
				class="w-full justify-start gap-3 h-auto px-2 py-2.5"
				onclick={() => onselect(session.id)}
			>
				<MessageSquare class="size-4 shrink-0 text-muted-foreground" />
				<div class="flex flex-col items-start gap-0.5 min-w-0">
					<span class="text-sm truncate w-full text-left"
						>{session.title ?? 'New conversation'}</span
					>
					<span class="flex items-center gap-1 text-xs text-muted-foreground">
						<Clock class="size-3" />
						{new Date(session.createdAt).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})}
					</span>
				</div>
			</Button>
		{/each}
	{/if}
</div>
