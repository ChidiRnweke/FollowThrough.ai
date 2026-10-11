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

	const used = $derived(summary.coverage.reduce((sum, kind) => sum + kind.used, 0));
	const total = $derived(summary.coverage.reduce((sum, kind) => sum + kind.total, 0));
	const lookups = $derived(
		summary.activity.reduce(
			(sum, week) => sum + week.note + week.attachment + week.memory + week.skill,
			0
		)
	);
	const lastUsed = $derived(
		summary.mostUsed.reduce<DateTime | undefined>(
			(latest, row) => (!latest || row.lastUsedAt > latest ? row.lastUsedAt : latest),
			undefined
		)
	);
</script>

<!--
	No boxes: size and colour carry the order. The ring and its percentage are the answer to
	"is the agent using my project"; the brand figure is how much; warning is what needs you.
-->
<section class="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-12">
	<div class="flex flex-col items-center gap-2">
		<CoverageDonut {used} {total} />
		<p class="max-w-52 text-center text-sm text-muted-foreground">
			{total === 0
				? 'Add notes, files or memory to give the agent something to work from.'
				: `${used} of ${total} notes, files and memory entries have been looked up.`}
		</p>
	</div>

	<div class="flex w-full flex-col divide-y divide-border sm:w-auto sm:min-w-72">
		<div class="flex flex-col gap-0.5 pb-4">
			<span class="text-4xl font-semibold tracking-tight text-brand tabular-nums">{lookups}</span>
			<span class="text-sm text-muted-foreground">
				{lookups === 1 ? 'lookup' : 'lookups'} across {summary.chats.length}
				{summary.chats.length === 1 ? 'chat' : 'chats'}
			</span>
		</div>
		<div class="flex flex-col gap-0.5 py-4">
			<span class="text-2xl font-medium tracking-tight"
				>{lastUsed ? formatRelativeTime(lastUsed) : 'Never'}</span
			>
			<span class="text-sm text-muted-foreground">last time it looked something up here</span>
		</div>
		<div class="pt-3">
			{#if attention > 0}
				<Button
					variant="ghost"
					class="-mx-3 h-auto gap-2 px-3 py-2 text-lg font-medium text-warning hover:bg-warning/10 hover:text-warning"
					onclick={onattention}
				>
					<Icon.Warning class="size-5" />
					{attention}
					{attention === 1 ? 'thing needs' : 'things need'} you
					<Icon.ArrowRight class="size-4" />
				</Button>
			{:else}
				<p class="flex items-center gap-2 py-2 text-lg text-muted-foreground">
					<Icon.Success class="size-5" /> Nothing needs you
				</p>
			{/if}
		</div>
	</div>
</section>
