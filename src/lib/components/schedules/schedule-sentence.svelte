<script lang="ts">
	import type { AgentExecutionMode, AgentModel } from '$lib/models/agent';
	import type { NoteId } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import type { IanaTimeZone, Recurrence, ScheduleStartView } from '$lib/models/schedules';
	import type { SkillSummary } from '$lib/models/skills';
	import type { LocalDate } from '$lib/models/workspace';
	import { parseDate } from '@internationalized/date';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import * as Icon from '$lib/components/icons';
	import { formatDate } from '$lib/components/shared/labels';
	import SchedulePromptField from './schedule-prompt-field.svelte';
	import TimeZoneField from './time-zone-field.svelte';
	import {
		MONTH_DAYS,
		RHYTHMS,
		clockValue,
		ordinal,
		rhythmOf,
		rhythmWord,
		timeOfClock,
		withRhythm,
		type Rhythm
	} from './sentence';

	// The schedule, written as the sentence a person would say. Each control is one word of it,
	// and each change is reported at once; the caller decides whether that saves.
	let {
		recurrence,
		timeZone,
		prompt,
		executionMode,
		start,
		model,
		projects,
		skills,
		models,
		defaultModelId,
		standing,
		disabled = false,
		onrecurrence,
		ontimezone,
		onprompt,
		onmode,
		onproject,
		onskills,
		onmodel
	}: {
		recurrence: Recurrence;
		timeZone: IanaTimeZone;
		prompt: string;
		executionMode: AgentExecutionMode;
		/** The project and the skills each run starts with, as this device knows them. */
		start: ScheduleStartView;
		/** The schedule's own model, or null for its owner's default. */
		model: string | null;
		/** What can be chosen for a run to start with. */
		projects: readonly Project[];
		skills: readonly SkillSummary[];
		models: readonly AgentModel[];
		defaultModelId: string;
		/** The one line under the sentence: when it runs next, or why it does not. */
		standing: string;
		disabled?: boolean;
		onrecurrence: (recurrence: Recurrence) => void;
		ontimezone: (timeZone: IanaTimeZone) => void;
		/** The prompt as typed, on every keystroke. */
		onprompt: (prompt: string) => void;
		onmode: (executionMode: AgentExecutionMode) => void;
		onproject: (projectId: ProjectId | null) => void;
		onskills: (skillNoteIds: readonly NoteId[]) => void;
		onmodel: (model: string | null) => void;
	} = $props();

	/** A run fails while its schedule names a project or a skill that is gone. */
	const stale = $derived(
		(start.project !== undefined && start.project.kind !== 'active') ||
			start.skills.some((skill) => skill.kind !== 'ready')
	);

	let dateOpen = $state(false);

	// A word that is a control reads as a value: brand ink at medium weight. The words between
	// them stay plain, so the eye lands on what can change and the sentence still reads through.
	const WORD = 'text-base font-medium text-brand';

	const MODES: Record<AgentExecutionMode, string> = {
		approval_required: 'ask me first',
		auto_accept: 'do not ask me'
	};

	function chooseRhythm(value: string): void {
		const rhythm = RHYTHMS.find((candidate) => candidate.value === value)?.value;
		if (rhythm) onrecurrence(withRhythm(recurrence, rhythm satisfies Rhythm, timeZone));
	}

	function chooseTime(value: string): void {
		const time = timeOfClock(value);
		if (time && recurrence.kind !== 'hourly') onrecurrence({ ...recurrence, time });
	}

	function chooseMinute(value: string): void {
		const minute = Number(value);
		if (recurrence.kind === 'hourly' && Number.isInteger(minute) && minute >= 0 && minute < 60)
			onrecurrence({ kind: 'hourly', minute });
	}
</script>

<!--
	The spacing ladder of the sentence: its rows stand a `row` step apart, as fields do. Its
	captions sit an `item` step under it and a `bind` step from each other, so they read as its
	own small print and not as another row.
-->
<div class="flex flex-col gap-item">
	<div class="flex flex-col gap-row text-base">
		<p class="flex flex-wrap items-center gap-2">
			{#if recurrence.kind !== 'once'}<span>Every</span>{/if}
			<Select.Root
				type="single"
				value={rhythmOf(recurrence)}
				onValueChange={chooseRhythm}
				{disabled}
			>
				<Select.Trigger class={WORD} aria-label="How often">
					{rhythmWord(recurrence)}
				</Select.Trigger>
				<Select.Content>
					{#each RHYTHMS as rhythm (rhythm.value)}
						<Select.Item value={rhythm.value} label={rhythm.label}>{rhythm.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			{#if recurrence.kind === 'hourly'}
				<span>at</span>
				<Input
					type="number"
					min="0"
					max="59"
					class={[WORD, 'w-20 tabular-nums md:text-base']}
					aria-label="Minutes past the hour"
					value={recurrence.minute}
					{disabled}
					onchange={(event) => chooseMinute(event.currentTarget.value)}
				/>
				<span>minutes past the hour,</span>
			{:else}
				{#if recurrence.kind === 'monthly'}
					<span>on the</span>
					<Select.Root
						type="single"
						value={String(recurrence.day)}
						{disabled}
						onValueChange={(value) => onrecurrence({ ...recurrence, day: Number(value) })}
					>
						<Select.Trigger class={[WORD, 'tabular-nums']} aria-label="Day of the month">
							{ordinal(recurrence.day)}
						</Select.Trigger>
						<Select.Content class="max-h-72">
							{#each MONTH_DAYS as day (day)}
								<Select.Item value={String(day)} label={ordinal(day)}>{ordinal(day)}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{:else if recurrence.kind === 'once'}
					<span>on</span>
					<Popover.Root bind:open={dateOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="outline" {disabled} class={WORD}>
									<Icon.Calendar data-icon="inline-start" />{formatDate(recurrence.date)}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-auto p-0" align="start">
							<Calendar
								value={parseDate(recurrence.date)}
								onValueChange={(next) => {
									dateOpen = false;
									if (next) onrecurrence({ ...recurrence, date: next.toString() as LocalDate });
								}}
							/>
						</Popover.Content>
					</Popover.Root>
				{/if}
				<span>at</span>
				<Input
					type="time"
					class={[
						WORD,
						// The browser's own clock glyph, lowered to the weight of the chevrons beside it.
						'w-auto tabular-nums md:text-base [&::-webkit-calendar-picker-indicator]:opacity-60'
					]}
					aria-label="Time of day"
					value={clockValue(recurrence.time)}
					{disabled}
					onchange={(event) => chooseTime(event.currentTarget.value)}
				/>
				<TimeZoneField value={timeZone} {disabled} class={WORD} onchange={ontimezone} />
				<!-- The comma closes the clause; pulled in so it sits against the word before it. -->
				<span class="-ml-1.5">,</span>
			{/if}
		</p>
		<SchedulePromptField
			{prompt}
			{start}
			{model}
			{projects}
			{skills}
			{models}
			{defaultModelId}
			{disabled}
			{onprompt}
			{onproject}
			{onskills}
			{onmodel}
		/>
		<p class="flex flex-wrap items-center gap-2">
			<span>and</span>
			<Select.Root
				type="single"
				value={executionMode}
				{disabled}
				onValueChange={(value) =>
					onmode(value === 'auto_accept' ? 'auto_accept' : 'approval_required')}
			>
				<Select.Trigger class={WORD} aria-label="Whether a run asks before a change">
					{MODES[executionMode]}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="approval_required" label={MODES.approval_required}>
						{MODES.approval_required}
					</Select.Item>
					<Select.Item value="auto_accept" label={MODES.auto_accept}>
						{MODES.auto_accept}
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<span>before it changes something.</span>
		</p>
	</div>
	<div class="flex flex-col gap-bind">
		{#if stale}
			<p class="provenance-caption">A run fails until what is marked is changed.</p>
		{/if}
		{#if executionMode === 'auto_accept'}
			<p class="provenance-caption">What it does in a connected service cannot be undone.</p>
		{/if}
		<p class="provenance-caption">{standing}</p>
	</div>
</div>
