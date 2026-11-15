<script lang="ts">
	import type { AgentExecutionMode, AgentModel, ConversationId } from '$lib/models/agent';
	import type { ScheduleChanges, ScheduleDetail } from '$lib/models/schedules';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Icon from '$lib/components/icons';
	import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
	import {
		deleteSchedule,
		pauseSchedule,
		resumeSchedule,
		runScheduleNow,
		setScheduleExecutionMode,
		updateSchedule
	} from '$lib/remote/schedules/schedules.remote';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import ScheduleHeading from './schedule-heading.svelte';
	import ScheduleRuns from './schedule-runs.svelte';
	import ScheduleSentence from './schedule-sentence.svelte';

	// One schedule: the sentence that defines it, changed in place, and the runs it started.
	// Every change saves at once, as a todo's fields do; the prompt saves when the field is left.
	let {
		detail,
		models,
		defaultModelId,
		onopenrun
	}: {
		detail: ScheduleDetail;
		/** The models a schedule can use, and the one its owner's default resolves to. */
		models: readonly AgentModel[];
		defaultModelId: string;
		onopenrun: (conversationId: ConversationId) => void;
	} = $props();

	const schedule = $derived(detail.schedule);
	let busy = $state(false);
	/** The prompt while it is being typed; undefined while the saved prompt is on screen. */
	let promptDraft = $state<string | undefined>();

	async function save<T>(request: Promise<T>): Promise<boolean> {
		busy = true;
		const result = await workspaceSession.serverChange(request);
		busy = false;
		if (result.kind === 'failure') toast.error(result.message);
		return result.kind !== 'failure';
	}

	const change = (changes: ScheduleChanges) =>
		save(updateSchedule({ scheduleId: schedule.id, changes }));

	async function savePrompt(): Promise<void> {
		const prompt = promptDraft?.trim();
		if (prompt === undefined) return;
		if (prompt && prompt !== schedule.prompt) await change({ prompt });
		promptDraft = undefined;
	}

	const setMode = (executionMode: AgentExecutionMode) =>
		save(setScheduleExecutionMode({ scheduleId: schedule.id, executionMode }));

	async function runNow(): Promise<void> {
		const started = await save(
			runScheduleNow({ scheduleId: schedule.id, requestId: crypto.randomUUID() })
		);
		if (started) toast.success('Started. The run appears below.');
	}

	async function remove(): Promise<void> {
		if (await save(deleteSchedule({ scheduleId: schedule.id }))) await goto('/scheduled');
	}
</script>

<PageShell>
	{#snippet header()}
		<ScheduleHeading
			title={schedule.title}
			placeholder="Untitled schedule"
			disabled={busy}
			onrename={(title) => void change({ title })}
		>
			{#snippet actions()}
				<Switch
					checked={schedule.status === 'active'}
					disabled={busy}
					aria-label={schedule.status === 'active' ? 'Pause this schedule' : 'Resume this schedule'}
					onCheckedChange={(checked) =>
						void save(
							checked
								? resumeSchedule({ scheduleId: schedule.id })
								: pauseSchedule({ scheduleId: schedule.id })
						)}
				/>
				<Button variant="outline" disabled={busy} onclick={() => void runNow()}>
					<Icon.Play data-icon="inline-start" />Run now
				</Button>
				<ConfirmDelete
					title="Delete {schedule.title}?"
					description="It stops running. The chats of its past runs stay in your history."
					{busy}
					onconfirm={remove}
				>
					{#snippet trigger(props)}
						<Button {...props} variant="ghost" disabled={busy}>Delete</Button>
					{/snippet}
				</ConfirmDelete>
			{/snippet}
		</ScheduleHeading>
	{/snippet}

	<div class="flex max-w-3xl flex-col gap-section">
		<!-- The sentence keeps a narrower measure than the runs under it: it is read, not scanned. -->
		<div
			class="max-w-2xl"
			onfocusout={(event) => {
				if (event.target instanceof HTMLTextAreaElement) void savePrompt();
			}}
		>
			<ScheduleSentence
				recurrence={schedule.recurrence}
				timeZone={schedule.timeZone}
				prompt={promptDraft ?? schedule.prompt}
				executionMode={schedule.executionMode}
				start={detail.start}
				model={schedule.model ?? null}
				projects={workspaceViews.projects}
				skills={workspaceViews.skills().filter((skill) => skill.isEnabled)}
				{models}
				{defaultModelId}
				standing={detail.standing}
				disabled={busy}
				onrecurrence={(recurrence) => void change({ recurrence })}
				ontimezone={(timeZone) => void change({ timeZone })}
				onprompt={(prompt) => (promptDraft = prompt)}
				onmode={(executionMode) => void setMode(executionMode)}
				onproject={(projectId) => void change({ projectId })}
				onskills={(skillNoteIds) => void change({ skillNoteIds })}
				onmodel={(model) => void change({ model })}
			/>
		</div>
		<ScheduleRuns runs={detail.runs} onopen={onopenrun} />
	</div>
</PageShell>
