<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import type { NoteId } from '$lib/models/notes';
	import type { ProjectId } from '$lib/models/projects';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Icon from '$lib/components/icons';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';

	let {
		summary,
		projectId,
		count
	}: { summary: ProjectContextUsageSummary; projectId: ProjectId; count: number } = $props();

	const reason = {
		queued: 'Waiting to be read',
		processing: 'Being read now',
		partial: 'Only partly read',
		unsupported: 'This file type cannot be read',
		failed: 'Could not be read'
	} as const;

	/** "3 notes, 1 memory entry": what sits unread, by kind, in everyday words. */
	const unreadByKind = $derived(
		(['note', 'attachment', 'memory'] as const)
			.map((kind) => ({
				kind,
				count: summary.neverUsed.filter((item) => item.kind === kind).length
			}))
			.filter((entry) => entry.count > 0)
			.map((entry) =>
				entry.kind === 'memory'
					? `${entry.count} memory ${entry.count === 1 ? 'entry' : 'entries'}`
					: `${entry.count} ${kindNoun[entry.kind][entry.count === 1 ? 0 : 1].toLowerCase()}`
			)
			.join(', ')
	);

	let writing = $state<string | null>(null);
	let reviewing = $state(false);

	/** A gap is fixed by the note that fills it, so the action starts that note. */
	async function writeNote(query: string): Promise<void> {
		writing = query;
		const id = crypto.randomUUID() as NoteId;
		const created = await workspaceSession
			.create({ kind: 'createNote', id, projectId, title: query })
			.finally(() => (writing = null));
		if (created.kind === 'failure') {
			toast.error('Could not create the note. Try again.');
			return;
		}
		await goto(`/notes/${id}`);
	}
</script>

<!-- Most actionable first: a gap you can fill, then a file you can fix, then what sits idle. -->
<section class="flex flex-col gap-item" aria-labelledby="todo-heading">
	<h2 id="todo-heading" class="section-title flex items-baseline gap-2">
		What to do
		<span class="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
	</h2>
	{#if count === 0}
		<p class="flex items-center gap-2 text-sm text-muted-foreground">
			<Icon.Success class="size-4" /> Nothing needs your attention. Every file can be read, every search
			found something, and the agent has used everything here.
		</p>
	{:else}
		<ul class="divide-y divide-border">
			{#each summary.missedSearches as search (search.query)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
					<Icon.Search class="size-4 shrink-0 text-muted-foreground" />
					<div class="flex min-w-0 grow basis-56 flex-col">
						<span class="truncate font-medium" title={search.query}>{search.query}</span>
						<span class="text-xs text-muted-foreground">
							Searched {search.times}
							{search.times === 1 ? 'time' : 'times'} · last {formatRelativeTime(search.lastAt)} · nothing
							in this project matched
						</span>
					</div>
					<div class="flex gap-1.5">
						<Button
							size="sm"
							variant="outline"
							disabled={writing !== null}
							onclick={() => writeNote(search.query)}
						>
							<Icon.DocumentPlus class="size-4" /> Write a note
						</Button>
						<Button size="sm" variant="ghost" href="/chats/{search.conversationId}">
							<Icon.Chat class="size-4" /> See the chat
						</Button>
					</div>
				</li>
			{/each}
			{#each summary.hiddenAttachments as file (file.id)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
					<Icon.Attachment class="size-4 shrink-0 text-muted-foreground" />
					<div class="flex min-w-0 grow basis-56 flex-col">
						<span class="truncate font-medium" title={file.title}>{file.title}</span>
						<span class="text-xs text-muted-foreground"
							>The agent can't read it: {reason[file.status]}{#if file.failure}: {file.failure}{/if}</span
						>
					</div>
					<Button size="sm" variant="outline" href="/projects/{projectId}/attachments">
						Fix in Attachments
					</Button>
				</li>
			{/each}
			{#if summary.neverUsed.length > 0}
				<li class="py-2.5">
					<Collapsible.Root bind:open={reviewing}>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<Icon.Document class="size-4 shrink-0 text-muted-foreground" />
							<div class="flex min-w-0 grow basis-56 flex-col">
								<span class="font-medium">
									{summary.neverUsed.length}
									{summary.neverUsed.length === 1 ? 'item' : 'items'} the agent has never read
								</span>
								<span class="text-xs text-muted-foreground">
									{unreadByKind} · a clear title and the words people search for help the agent find them;
									remove what is out of date
								</span>
							</div>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										size="sm"
										variant="outline"
										class="[&[data-state=open]>svg]:rotate-90"
									>
										Review <Icon.ChevronRight class="size-4 transition-transform" />
									</Button>
								{/snippet}
							</Collapsible.Trigger>
						</div>
						<Collapsible.Content>
							<ul class="mt-2 ml-7 divide-y divide-border" aria-label="Items the agent never read">
								{#each summary.neverUsed as item (`${item.kind}:${item.id}`)}
									<li class="row-interactive flex items-center gap-3 px-3 py-2 text-sm">
										<div class="min-w-0 flex-1"><ItemLink {item} {projectId} /></div>
										<span class="shrink-0 text-xs text-muted-foreground"
											>{kindNoun[item.kind][0]}</span
										>
									</li>
								{/each}
							</ul>
						</Collapsible.Content>
					</Collapsible.Root>
				</li>
			{/if}
		</ul>
	{/if}
</section>
