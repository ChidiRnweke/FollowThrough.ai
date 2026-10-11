<script lang="ts">
	import type { ProjectItem } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Icon from '$lib/components/icons';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';

	let { items, projectId }: { items: readonly ProjectItem[]; projectId: ProjectId } = $props();

	const glyph = { note: Icon.Document, attachment: Icon.Attachment, memory: Icon.Memory } as const;
	const hrefOf = (item: ProjectItem) =>
		item.kind === 'note'
			? `/notes/${item.id}`
			: item.kind === 'attachment'
				? `/projects/${projectId}/attachments`
				: `/projects/${projectId}/memory`;

	/** State: the list stays closed until asked for, whatever re-renders around it. */
	let listOpen = $state(false);
</script>

<section class="flex flex-col gap-4" aria-labelledby="unused-heading">
	<header class="flex items-baseline gap-3">
		<span class="text-4xl font-semibold tracking-tight text-warning tabular-nums"
			>{items.length}</span
		>
		<div class="flex flex-col">
			<h2 id="unused-heading" class="text-base font-medium">Never looked up</h2>
			<p class="text-sm text-muted-foreground">
				One square per item the agent has never used. A clear title and the words people search for
				help it find them; remove what is out of date.
			</p>
		</div>
	</header>

	<!-- A square per item: the count becomes something the eye can weigh, and each one opens. -->
	<ul class="flex flex-wrap gap-1.5" aria-label="Items never looked up">
		{#each items as item (`${item.kind}:${item.id}`)}
			{@const Glyph = glyph[item.kind]}
			<li>
				<Tip text="{kindNoun[item.kind][0]}: {item.title}">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="outline"
							size="icon"
							href={hrefOf(item)}
							aria-label="Open {item.title}"
							class="size-10 rounded-md border-dashed text-muted-foreground hover:border-warning hover:text-warning"
						>
							<Glyph class="size-4" />
						</Button>
					{/snippet}
				</Tip>
			</li>
		{/each}
	</ul>

	<Collapsible.Root bind:open={listOpen}>
		<Collapsible.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="-ml-2 w-fit gap-1.5 text-muted-foreground [&[data-state=open]>svg]:rotate-90"
				>
					<Icon.ChevronRight class="size-4 transition-transform" /> Show as a list
				</Button>
			{/snippet}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<ul class="divide-y divide-border">
				{#each items as item (`${item.kind}:${item.id}`)}
					<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
						<div class="min-w-0 flex-1"><ItemLink {item} {projectId} /></div>
						<span class="shrink-0 text-xs text-muted-foreground">{kindNoun[item.kind][0]}</span>
					</li>
				{/each}
			</ul>
		</Collapsible.Content>
	</Collapsible.Root>
</section>
