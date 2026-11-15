<script lang="ts">
	import type { ScheduleId, ScheduleRow } from '$lib/models/schedules';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Icon from '$lib/components/icons';
	import * as Scene from '$lib/components/icons/scenes';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { pauseSchedule, resumeSchedule } from '$lib/remote/schedules/schedules.remote';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';

	let { rows }: { rows: readonly ScheduleRow[] } = $props();

	const active = $derived(rows.filter((row) => row.schedule.status === 'active'));
	const resting = $derived(rows.filter((row) => row.schedule.status !== 'active'));
	const changing = new SvelteSet<ScheduleId>();

	async function setRunning(row: ScheduleRow, running: boolean): Promise<void> {
		const scheduleId = row.schedule.id;
		changing.add(scheduleId);
		const result = await workspaceSession.serverChange(
			running ? resumeSchedule({ scheduleId }) : pauseSchedule({ scheduleId })
		);
		changing.delete(scheduleId);
		if (result.kind === 'failure') toast.error(result.message);
	}
</script>

{#snippet list(heading: string, items: readonly ScheduleRow[])}
	<!-- The eyebrow sits a `row` step above its list, as on the project overview. -->
	<section class="flex flex-col gap-row">
		<h2 class="eyebrow">{heading}</h2>
		<!-- Bled 12px past the measure: the switch keeps the page's left edge, and the hover wash
		     and the hairlines have room around the row. -->
		<ul class="-mx-3 divide-y divide-border border-y border-border">
			{#each items as row (row.schedule.id)}
				{@const schedule = row.schedule}
				<li class="flex items-center pl-3">
					<Switch
						checked={schedule.status === 'active'}
						disabled={changing.has(schedule.id)}
						aria-label={schedule.status === 'active'
							? `Pause ${schedule.title}`
							: `Resume ${schedule.title}`}
						onCheckedChange={(checked) => void setRunning(row, checked)}
					/>
					<a
						href="/scheduled/{schedule.id}"
						class="row-interactive flex min-w-0 flex-1 items-center gap-3 px-3 py-3"
					>
						<span class="flex min-w-0 flex-1 flex-col gap-bind">
							<span
								class={[
									'truncate text-sm',
									row.waiting || row.unopened ? 'font-semibold' : 'font-medium'
								]}>{schedule.title}</span
							>
							<span class="provenance-caption truncate">{row.caption}</span>
						</span>
						{#if row.waiting}
							<Badge variant="brand" class="shrink-0"><Icon.Pause />Waiting for you</Badge>
						{:else if row.unopened}
							<Badge variant="brand" class="shrink-0">{row.unopened} new</Badge>
						{/if}
						<Icon.ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/snippet}

<PageShell>
	{#snippet header()}
		<!-- PageShell's own ladder, at the list's measure: the action ends where the rows end. -->
		<div class="flex w-full max-w-3xl flex-wrap items-start justify-between gap-3">
			<div class="flex flex-col">
				<h1 class="page-title">Scheduled</h1>
				<p class="mt-1.5 text-sm text-muted-foreground">
					Prompts the agent runs for you at set times. Each run is a chat.
				</p>
			</div>
			<!-- An empty page has one action, and the empty state carries it. -->
			{#if rows.length > 0}
				<Button href="/scheduled/new"><Icon.Plus data-icon="inline-start" />New schedule</Button>
			{/if}
		</div>
	{/snippet}

	{#if rows.length === 0}
		<EmptyState
			size="large"
			scene={Scene.NothingScheduled}
			title="Nothing scheduled."
			hint="Save a prompt with a time, and the agent runs it while you are away."
		>
			{#snippet action()}
				<Button href="/scheduled/new"><Icon.Plus data-icon="inline-start" />New schedule</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<!-- Two lists with hairlines need a `section` step between them: at a `group` step the
		     second eyebrow sits in a band the height of a row and reads as one more row. -->
		<div class="flex max-w-3xl flex-col gap-section">
			{#if active.length > 0}{@render list('Active', active)}{/if}
			{#if resting.length > 0}{@render list('Not running', resting)}{/if}
		</div>
	{/if}
</PageShell>
