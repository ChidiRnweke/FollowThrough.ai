<script lang="ts">
	import type { EntityRef } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import { FtExternal } from '$lib/components/icons';
	import { CHAT_ROW, CHAT_ROW_ICON } from '../chat-row';
	import { canOpenEntity, entityIcon, openEntity } from '../open-entity';

	let {
		entities,
		total,
		empty
	}: {
		entities: readonly EntityRef[];
		/** The true count when more came back than are shown. */
		total?: number;
		/** What to say when the call returned nothing — the answer, not an error. */
		empty: string;
	} = $props();

	const hidden = $derived(Math.max(0, (total ?? entities.length) - entities.length));
</script>

<!--
	What came back, as the things themselves rather than as a count. `list_todos` returning
	"Todos: 5" tells the reader the call worked and nothing about their work; five titles tell
	them whether the agent was looking at the right things, which is the only reason to open a
	read at all.
-->
{#if entities.length === 0}
	<p class="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>
{:else}
	<ul class="flex flex-col">
		{#each entities as entity, index (`${entity.kind}-${entity.id ?? entity.title}-${index}`)}
			{@const Icon = entityIcon[entity.kind]}
			<li>
				{#if canOpenEntity(entity)}
					<Button
						variant="ghost"
						size="sm"
						class="group/entity {CHAT_ROW}"
						onclick={() => openEntity(entity)}
					>
						<Icon class="{CHAT_ROW_ICON} text-muted-foreground" />
						<span class="min-w-0 truncate" title={entity.title}>{entity.title}</span>
						<FtExternal
							class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--duration-micro) group-hover/entity:opacity-100"
						/>
					</Button>
				{:else}
					<!-- Nothing to open, so nothing that looks like it opens. -->
					<div class="{CHAT_ROW} text-muted-foreground">
						<Icon class={CHAT_ROW_ICON} />
						<span class="min-w-0 truncate" title={entity.title}>{entity.title}</span>
					</div>
				{/if}
			</li>
		{/each}
		{#if hidden > 0}
			<!-- Counted rather than listed: the point of the first five is whether the agent was
			     looking in the right place, and a sixth through fiftieth does not add to that. -->
			<li class="px-2 py-1.5 text-xs text-muted-foreground">…and {hidden} more</li>
		{/if}
	</ul>
{/if}
