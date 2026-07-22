<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Conversation, ShellContext } from '$lib/models';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import Search from '@lucide/svelte/icons/search';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Plus from '@lucide/svelte/icons/plus';
	import ChatHistoryList from '$lib/components/app/panels/chat-history-list.svelte';

	let {
		shell,
		sessions,
		query,
		page,
		hasNext
	}: {
		shell: ShellContext;
		sessions: readonly Conversation[];
		query: string;
		page: number;
		hasNext: boolean;
	} = $props();

	let search = $state<string | undefined>(undefined);
	const effectiveSearch = $derived(search ?? query);
	const href = (nextPage: number): string =>
		`/chats?${new URLSearchParams({ ...(effectiveSearch.trim() ? { q: effectiveSearch.trim() } : {}), page: String(nextPage) })}`;

	function submitSearch(): void {
		void goto(href(1));
	}
</script>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-8">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="provenance-caption">Agent workspace</p>
			<h1 class="page-title">Chats</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Find conversations by title and return to their project or note context.
			</p>
		</div>
		<Button href="/chats/new"><Plus data-icon="inline-start" /> New chat</Button>
	</header>

	<InputGroup.Root>
		<InputGroup.Input
			value={effectiveSearch}
			oninput={(event) => (search = event.currentTarget.value)}
			placeholder="Search chats…"
			aria-label="Search chats"
			onkeydown={(event) => {
				if (event.key === 'Enter') submitSearch();
			}}
		/>
		<InputGroup.Addon align="inline-end">
			<InputGroup.Button aria-label="Search" onclick={submitSearch}><Search /></InputGroup.Button>
		</InputGroup.Addon>
	</InputGroup.Root>

	{#if sessions.length > 0}
		<ChatHistoryList
			{sessions}
			{shell}
			limit={25}
			showAllLink={false}
			onselect={(id) => void goto(`/chats/${id}`)}
		/>
		<div class="flex items-center justify-between">
			<Button variant="outline" disabled={page <= 1} href={href(Math.max(1, page - 1))}
				>Previous</Button
			>
			<span class="text-sm text-muted-foreground">Page {page}</span>
			<Button variant="outline" disabled={!hasNext} href={href(page + 1)}>Next</Button>
		</div>
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon"><MessageSquare /></Empty.Media>
				<Empty.Title>{query ? 'No matching chats' : 'No chats yet'}</Empty.Title>
				<Empty.Description
					>{query
						? 'Try a different search term.'
						: 'Start a conversation from any project or note.'}</Empty.Description
				>
			</Empty.Header>
			<Empty.Content><Button href="/chats/new">Start a chat</Button></Empty.Content>
		</Empty.Root>
	{/if}
</main>
