<script lang="ts">
	import type { ContextItem, HiddenAttachment } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectContextUsage } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Icon from '$lib/components/icons';

	let { projectId }: { projectId: ProjectId } = $props();

	const usage = $derived(getProjectContextUsage({ projectId }));

	const glyph = {
		note: Icon.Document,
		attachment: Icon.Attachment,
		memory: Icon.Memory,
		skill: Icon.Skill
	} as const;

	const kindLabel = { note: 'Note', attachment: 'File', memory: 'Memory', skill: 'Skill' } as const;

	/** Where each kind lives. Files and memory have no page of their own, only their list. */
	const hrefOf = (item: ContextItem): string =>
		item.kind === 'note'
			? `/notes/${item.id}`
			: item.kind === 'skill'
				? `/skills/${item.id}`
				: item.kind === 'attachment'
					? `/projects/${projectId}/attachments`
					: `/projects/${projectId}/memory`;

	const statusText: Record<HiddenAttachment['status'], string> = {
		queued: 'Waiting to be read',
		processing: 'Being read now',
		partial: 'Only partly read',
		unsupported: 'File type not supported',
		failed: 'Could not be read'
	};

	const uses = (count: number) => `${count} ${count === 1 ? 'use' : 'uses'}`;
</script>

{#snippet itemLink(item: ContextItem)}
	{@const Glyph = glyph[item.kind]}
	<a href={hrefOf(item)} class="flex min-w-0 items-center gap-2 hover:underline">
		<Glyph class="size-4 shrink-0 text-muted-foreground" />
		<span class="truncate" title={item.title}>{item.title}</span>
	</a>
{/snippet}

{#if usage.error}
	<p role="alert" class="text-sm text-destructive">
		{userFacingMessage(usage.error, 'What the agent used here could not be loaded.')}
	</p>
{:else if !usage.current}
	<div class="flex flex-col gap-3" aria-busy="true">
		<Skeleton class="h-5 w-40" />
		<Skeleton class="h-10 w-full" />
		<Skeleton class="h-10 w-full" />
	</div>
{:else}
	{@const summary = usage.current}
	<div class="flex flex-col gap-8">
		{#if summary.hiddenAttachments.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="context-hidden">
				<h2 id="context-hidden" class="eyebrow">Files the agent can't see</h2>
				<p class="text-sm text-muted-foreground">
					The agent finds files by searching their text. These have no searchable text yet.
				</p>
				<ul class="divide-y divide-border">
					{#each summary.hiddenAttachments as file (file.id)}
						<li class="flex items-start gap-3 px-3 py-2.5">
							<Icon.Warning class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<div class="flex min-w-0 flex-col gap-0.5">
								<a
									href="/projects/{projectId}/attachments"
									class="truncate text-sm font-medium hover:underline">{file.title}</a
								>
								<span class="text-xs text-muted-foreground"
									>{statusText[file.status]}{#if file.failure}: {file.failure}{/if}</span
								>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="flex flex-col gap-2" aria-labelledby="context-most-used">
			<h2 id="context-most-used" class="eyebrow">Most used</h2>
			{#if summary.mostUsed.length === 0}
				<EmptyState
					icon={Icon.Reading}
					title="The agent hasn't read anything in this project yet."
					hint="Ask about it in a chat; whatever it looks up shows here."
				/>
			{:else}
				<ul class="divide-y divide-border">
					{#each summary.mostUsed as row (`${row.item.kind}:${row.item.id}`)}
						<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
							<div class="min-w-0 flex-1">{@render itemLink(row.item)}</div>
							<span class="shrink-0 text-xs text-muted-foreground">
								{kindLabel[row.item.kind]} · {uses(row.uses)} · {formatRelativeTime(row.lastUsedAt)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if summary.neverUsed.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="context-never-used">
				<h2 id="context-never-used" class="eyebrow">Never used · {summary.neverUsed.length}</h2>
				<p class="text-sm text-muted-foreground">
					The agent has not read these in any chat. A clear title and the words people search for
					help it find them; remove what is out of date.
				</p>
				<ul class="divide-y divide-border">
					{#each summary.neverUsed as item (`${item.kind}:${item.id}`)}
						<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
							<div class="min-w-0 flex-1">{@render itemLink(item)}</div>
							<span class="shrink-0 text-xs text-muted-foreground">{kindLabel[item.kind]}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if summary.missedSearches.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="context-empty-searches">
				<h2 id="context-empty-searches" class="eyebrow">Searches that found nothing</h2>
				<p class="text-sm text-muted-foreground">
					The agent looked for these and this project had nothing. Each is a note or file you could
					add.
				</p>
				<ul class="divide-y divide-border">
					{#each summary.missedSearches as search (search.query)}
						<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
							<Icon.Search class="size-4 shrink-0 text-muted-foreground" />
							<a
								href="/chats/{search.conversationId}"
								class="min-w-0 flex-1 truncate hover:underline">{search.query}</a
							>
							<span class="shrink-0 text-xs text-muted-foreground"
								>{search.times > 1 ? `${search.times} times · ` : ''}{formatRelativeTime(
									search.lastAt
								)}</span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if summary.chats.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="context-chats">
				<h2 id="context-chats" class="eyebrow">Chats that used this project</h2>
				<ul class="divide-y divide-border">
					{#each summary.chats as chat (chat.conversationId)}
						<li class="row-interactive flex flex-col gap-1.5 px-3 py-2.5 text-sm">
							<div class="flex items-center gap-3">
								<a
									href="/chats/{chat.conversationId}"
									class="min-w-0 flex-1 truncate font-medium hover:underline"
									>{chat.title ?? 'Untitled chat'}</a
								>
								<span class="shrink-0 text-xs text-muted-foreground"
									>{formatRelativeTime(chat.lastUsedAt)}</span
								>
							</div>
							<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
								{#each chat.items as item (`${item.kind}:${item.id}`)}
									<li class="min-w-0 max-w-full">{@render itemLink(item)}</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if summary.unreadableCalls > 0}
			<p class="text-xs text-muted-foreground">
				{summary.unreadableCalls}
				{summary.unreadableCalls === 1 ? 'older tool call' : 'older tool calls'} across your chats could
				not be read and {summary.unreadableCalls === 1 ? 'is' : 'are'} not counted here.
			</p>
		{/if}
	</div>
{/if}
