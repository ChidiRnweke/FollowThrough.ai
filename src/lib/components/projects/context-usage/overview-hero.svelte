<script lang="ts">
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import type { DateTime } from '$lib/models/workspace';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';
	import CoverageDonut from './coverage-donut.svelte';

	let {
		summary,
		attention,
		onattention
	}: {
		summary: ProjectContextUsageSummary;
		/** How many things wait in the attention tab. */
		attention: number;
		onattention: () => void;
	} = $props();

	const read = $derived(summary.coverage.reduce((sum, kind) => sum + kind.used, 0));
	const total = $derived(summary.coverage.reduce((sum, kind) => sum + kind.total, 0));
	const times = $derived(
		summary.activity.reduce(
			(sum, week) => sum + week.note + week.attachment + week.memory + week.skill,
			0
		)
	);
	const lastRead = $derived(
		summary.mostUsed.reduce<DateTime | undefined>(
			(latest, row) => (!latest || row.lastUsedAt > latest ? row.lastUsedAt : latest),
			undefined
		)
	);

	/** Each figure is the number over the sentence that says what it counts, on one left edge. */
	const figures = $derived([
		{ value: String(times), caption: 'times the agent read something here' },
		{ value: String(summary.chats.length), caption: 'chats used this project' },
		{
			value: lastRead ? formatRelativeTime(lastRead) : 'Never',
			caption: 'last time the agent read something here'
		}
	]);
</script>

<section class="grid items-center gap-group sm:grid-cols-[auto_1fr]" aria-label="Summary">
	<CoverageDonut {read} {total} />
	<div class="flex flex-col gap-group">
		<p class="section-title">
			{total === 0
				? 'This project has no notes, files or memory for the agent to read yet.'
				: `The agent has read ${read} of your ${total} notes, files and memory entries.`}
		</p>
		<dl class="grid gap-group sm:grid-cols-3">
			{#each figures as figure (figure.caption)}
				<!-- The caption is the term, so it comes first; reversed, the number reads first. -->
				<div class="flex flex-col-reverse justify-end gap-1">
					<dt class="text-sm text-muted-foreground">{figure.caption}</dt>
					<dd class="stat-value">{figure.value}</dd>
				</div>
			{/each}
		</dl>
		{#if attention > 0}
			<Button variant="outline" size="sm" class="w-fit" onclick={onattention}>
				Review {attention}
				{attention === 1 ? 'item' : 'items'}
				<Icon.ArrowRight class="size-4" />
			</Button>
		{:else}
			<p class="flex items-center gap-2 text-sm text-muted-foreground">
				<Icon.Success class="size-4" /> Nothing needs your attention.
			</p>
		{/if}
	</div>
</section>
