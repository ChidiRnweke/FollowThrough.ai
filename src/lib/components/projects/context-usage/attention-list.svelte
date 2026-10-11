<script lang="ts">
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Icon from '$lib/components/icons';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';

	let { summary, projectId }: { summary: ProjectContextUsageSummary; projectId: ProjectId } =
		$props();

	const statusText = {
		queued: 'Waiting to be read',
		processing: 'Being read now',
		partial: 'Only partly read',
		unsupported: 'File type not supported',
		failed: 'Could not be read'
	} as const;

	const nothing = $derived(
		summary.hiddenAttachments.length === 0 &&
			summary.missedSearches.length === 0 &&
			summary.neverUsed.length === 0
	);

	/** State, not derived: a long list stays closed until the reader asks for it. */
	let neverUsedOpen = $state(false);
</script>

<section class="flex flex-col gap-4" aria-labelledby="attention-heading">
	<h2 id="attention-heading" class="eyebrow">Needs your attention</h2>
	{#if nothing}
		<p class="flex items-center gap-2 text-sm text-muted-foreground">
			<Icon.Success class="size-4" /> Nothing needs your attention. The agent can read everything here.
		</p>
	{/if}

	{#if summary.hiddenAttachments.length > 0}
		<div class="flex flex-col gap-1.5">
			<h3 class="text-sm font-medium">Files it can't read</h3>
			<p class="text-label text-muted-foreground">
				The agent finds files by searching their text. These have no searchable text yet, so it
				cannot use them.
			</p>
			<ul class="divide-y divide-border">
				{#each summary.hiddenAttachments as file (file.id)}
					<li class="flex items-start gap-3 px-3 py-2.5">
						<Icon.Warning class="mt-0.5 size-4 shrink-0 text-destructive" />
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
		</div>
	{/if}

	{#if summary.missedSearches.length > 0}
		<div class="flex flex-col gap-1.5">
			<h3 class="text-sm font-medium">Searches with no answer</h3>
			<p class="text-label text-muted-foreground">
				The agent looked for these and this project had nothing. Each is a note or file you could
				add.
			</p>
			<ul class="divide-y divide-border">
				{#each summary.missedSearches as search (search.query)}
					<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
						<Icon.Search class="size-4 shrink-0 text-muted-foreground" />
						<a href="/chats/{search.conversationId}" class="min-w-0 flex-1 truncate hover:underline"
							>{search.query}</a
						>
						<span class="shrink-0 text-xs text-muted-foreground"
							>{search.times > 1 ? `${search.times} times · ` : ''}{formatRelativeTime(
								search.lastAt
							)}</span
						>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if summary.neverUsed.length > 0}
		<Collapsible.Root bind:open={neverUsedOpen} class="flex flex-col gap-1.5">
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="h-auto w-fit justify-start gap-1.5 px-0 text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-90"
					>
						<Icon.ChevronRight class="size-4 transition-transform" />
						Never looked up · {summary.neverUsed.length}
					</Button>
				{/snippet}
			</Collapsible.Trigger>
			<p class="text-label text-muted-foreground">
				The agent has not used these in any chat. A clear title and the words people search for help
				it find them; remove what is out of date.
			</p>
			<Collapsible.Content>
				<ul class="divide-y divide-border">
					{#each summary.neverUsed as item (`${item.kind}:${item.id}`)}
						<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
							<div class="min-w-0 flex-1"><ItemLink {item} {projectId} /></div>
							<span class="shrink-0 text-xs text-muted-foreground">{kindNoun[item.kind][0]}</span>
						</li>
					{/each}
				</ul>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
</section>
