<script lang="ts">
	import type { AgentExecutionMode } from '$lib/models/agent';
	import type { IanaTimeZone, Recurrence, ScheduleId } from '$lib/models/schedules';
	import type { DateTime } from '$lib/models/workspace';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
	import { createSchedule } from '$lib/remote/schedules/schedules.remote';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import ScheduleHeading from './schedule-heading.svelte';
	import ScheduleSentence from './schedule-sentence.svelte';

	// A schedule before it is saved: the same sentence, and one button.
	let { now, timeZone: browserZone }: { now: DateTime; timeZone: IanaTimeZone } = $props();

	let title = $state('');
	let prompt = $state('');
	let recurrence = $state<Recurrence>({ kind: 'weekdays', time: { hour: 8, minute: 0 } });
	// The schedule starts on the clock of the place it is made in; the sentence can change it.
	// svelte-ignore state_referenced_locally
	let timeZone = $state(browserZone);
	let executionMode = $state<AgentExecutionMode>('approval_required');
	let creating = $state(false);

	/** A schedule nobody named is named for the first words of its prompt, as a chat is. */
	const name = $derived(title.trim() || prompt.trim().split('\n')[0]!.slice(0, 60));
	const preview = $derived(workspaceViews.schedulePreview(recurrence, timeZone, now));

	async function create(): Promise<void> {
		creating = true;
		const id = crypto.randomUUID() as ScheduleId;
		const result = await workspaceSession.serverChange(
			createSchedule({
				id,
				definition: { title: name, prompt: prompt.trim(), recurrence, timeZone, executionMode }
			})
		);
		creating = false;
		if (result.kind === 'failure') return void toast.error(result.message);
		await goto(`/scheduled/${id}`);
	}
</script>

<PageShell>
	{#snippet header()}
		<ScheduleHeading
			{title}
			placeholder="New schedule"
			disabled={creating}
			onrename={(next) => (title = next)}
		/>
	{/snippet}

	<!--
		The sentence keeps a narrower measure than a list: it is read, not scanned. The action
		stands a `group` step under it: it acts on the whole schedule, not on its last row.
	-->
	<div class="flex max-w-2xl flex-col gap-group">
		<ScheduleSentence
			{recurrence}
			{timeZone}
			{prompt}
			{executionMode}
			standing={preview}
			disabled={creating}
			onrecurrence={(next) => (recurrence = next)}
			ontimezone={(next) => (timeZone = next)}
			onprompt={(next) => (prompt = next)}
			onmode={(next) => (executionMode = next)}
		/>
		<div class="flex items-center justify-end gap-2">
			<Button variant="ghost" href="/scheduled" disabled={creating}>Cancel</Button>
			<Button disabled={creating || !prompt.trim()} onclick={() => void create()}>
				Create schedule
			</Button>
		</div>
	</div>
</PageShell>
