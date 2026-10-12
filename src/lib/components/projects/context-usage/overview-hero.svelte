<script lang="ts">
	import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
	import type { DateTime } from '$lib/models/workspace';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Progress } from '$lib/components/ui/progress';
	import * as Icon from '$lib/components/icons';
	import { kindNoun } from './kinds';
	import { weeklyConclusion } from './weekly';

	let {
		summary,
		projectName,
		toFix
	}: {
		summary: ProjectContextUsageSummary;
		projectName: string;
		/** How many rows wait in "What to do" beneath the hero. */
		toFix: number;
	} = $props();

	const read = $derived(summary.coverage.reduce((sum, kind) => sum + kind.used, 0));
	const total = $derived(summary.coverage.reduce((sum, kind) => sum + kind.total, 0));
	const percent = $derived(total === 0 ? 0 : Math.round((read / total) * 100));
	const kinds = $derived(summary.coverage.filter((kind) => kind.total > 0));
	const week = $derived(weeklyConclusion(summary.activity));
	const lastRead = $derived(
		summary.mostUsed.reduce<DateTime | undefined>(
			(latest, row) => (!latest || row.lastUsedAt > latest ? row.lastUsedAt : latest),
			undefined
		)
	);
	const change = $derived(week?.lastWeek === undefined ? undefined : week.thisWeek - week.lastWeek);
</script>

<section
	class="grid items-start gap-section lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]"
	aria-label="Summary"
>
	{#if total === 0}
		<p class="section-title">
			<span class="font-medium text-brand italic">{projectName}</span> has no notes, files or memory for
			the agent to read yet.
		</p>
	{:else}
		<div class="flex flex-col gap-row">
			<div class="flex flex-col gap-bind">
				<p class="stat-value-hero">{percent}%</p>
				<p class="text-sm text-muted-foreground">
					of <span class="font-medium text-brand italic">{projectName}</span> has been read: {read}
					of {total} notes, files and memory entries.
				</p>
			</div>
			<Progress
				value={percent}
				class="h-1.5 bg-chart-1"
				indicatorClass="bg-brand"
				aria-label="{percent}% read"
			/>
			<dl class="grid grid-cols-3 gap-group">
				{#each kinds as kind (kind.kind)}
					<div class="flex flex-col gap-1.5 text-sm">
						<div class="flex flex-wrap justify-between gap-x-2">
							<dt class="text-muted-foreground">{kindNoun[kind.kind][1]}</dt>
							<dd class="font-medium whitespace-nowrap tabular-nums">
								{kind.used} of {kind.total}
							</dd>
						</div>
						<Progress
							value={kind.used}
							max={kind.total}
							class="h-1 bg-chart-1"
							indicatorClass="bg-brand"
							aria-hidden="true"
						/>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- The caption is the term, so it comes first; reversed, the number reads first. -->
	<dl class="grid grid-cols-3 gap-group lg:pt-2">
		<div class="flex flex-col-reverse justify-end gap-1">
			<dt class="text-sm text-muted-foreground">to fix</dt>
			<dd class="stat-value">{toFix}</dd>
		</div>
		<div class="flex flex-col-reverse justify-end gap-1">
			<dt class="text-sm text-muted-foreground">
				reads this week
				{#if change !== undefined}
					<span class="flex items-center gap-0.5">
						{#if change > 0}<Icon.ArrowUp class="size-3" />{:else if change < 0}<Icon.ArrowDown
								class="size-3"
							/>{/if}
						{change === 0 ? 'same as last week' : `${Math.abs(change)} vs last week`}
					</span>
				{/if}
			</dt>
			<dd class="stat-value">{week?.thisWeek ?? 0}</dd>
		</div>
		<div class="flex flex-col-reverse justify-end gap-1">
			<dt class="text-sm text-muted-foreground">last read</dt>
			<dd class="stat-value">{lastRead ? formatRelativeTime(lastRead) : 'Never'}</dd>
		</div>
	</dl>
</section>
