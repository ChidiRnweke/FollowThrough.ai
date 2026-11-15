import type { AgentRunStatus } from '$lib/models/agent';
import type {
	IanaTimeZone,
	NextOccurrence,
	Recurrence,
	Schedule,
	ScheduleOccurrence,
	ScheduleViewer,
	ScheduledRunState,
	TimeOfDay,
	Weekday
} from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';

export interface SchedulePresentation {
	/** A recurrence in words, such as "Weekdays at 08:00". */
	describe(recurrence: Recurrence): string;
	/** A time zone as a person names it, such as "Brussels time". */
	zoneName(timeZone: IanaTimeZone): string;
	/** A moment on the clock of a time zone, such as "Tomorrow, 08:00" or "Fri 20 Nov, 16:00". */
	when(instant: DateTime, timeZone: IanaTimeZone, now: DateTime): string;
	/** The line under a schedule's title: its recurrence, whether it asks first, its next run. */
	caption(schedule: Schedule, viewer: ScheduleViewer): string;
	/** What a saved schedule does next, for the line under its sentence. */
	standing(schedule: Schedule, waiting: boolean, now: DateTime): string;
	/** What an unsaved recurrence would do next, for the line under the sentence. */
	preview(next: NextOccurrence, timeZone: IanaTimeZone, now: DateTime): string;
	runState(
		occurrence: Pick<ScheduleOccurrence, 'openedAt'>,
		run: {
			readonly status: AgentRunStatus;
			readonly updatedAt: DateTime;
			readonly pendingChanges: number;
		}
	): ScheduledRunState;
	/** What a run came to in one line; `answer` is the text of its final answer, if it gave one. */
	line(state: ScheduledRunState, failure: string | undefined, answer: string | undefined): string;
	/** When a run started, and the time it was due when it started in a later minute. */
	ranAt(
		occurrence: Pick<ScheduleOccurrence, 'createdAt' | 'scheduledFor' | 'trigger'>,
		timeZone: IanaTimeZone,
		now: DateTime
	): string;
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
	mon: 'Mondays',
	tue: 'Tuesdays',
	wed: 'Wednesdays',
	thu: 'Thursdays',
	fri: 'Fridays',
	sat: 'Saturdays',
	sun: 'Sundays'
};

/** How a schedule and its runs read to their owner (ADR 0052). Every list shows these words. */
export class SchedulePresentationService implements SchedulePresentation {
	describe(recurrence: Recurrence): string {
		switch (recurrence.kind) {
			case 'once':
				return `Once on ${this.dateOf(recurrence.date)} at ${this.clock(recurrence.time)}`;
			case 'hourly':
				return `Every hour at :${String(recurrence.minute).padStart(2, '0')}`;
			case 'daily':
				return `Every day at ${this.clock(recurrence.time)}`;
			case 'weekdays':
				return `Weekdays at ${this.clock(recurrence.time)}`;
			case 'weekly':
				return `${WEEKDAY_NAMES[recurrence.weekday]} at ${this.clock(recurrence.time)}`;
			case 'monthly':
				return `Monthly on the ${this.ordinal(recurrence.day)} at ${this.clock(recurrence.time)}`;
		}
	}

	zoneName(timeZone: IanaTimeZone): string {
		const place = timeZone.split('/').at(-1) ?? timeZone;
		return `${place.replaceAll('_', ' ')} time`;
	}

	when(instant: DateTime, timeZone: IanaTimeZone, now: DateTime): string {
		const moment = this.local(instant, timeZone);
		const today = this.local(now, timeZone);
		const days = Math.round((moment.dayNumber - today.dayNumber) / 86_400_000);
		const day =
			days === 0
				? 'Today'
				: days === 1
					? 'Tomorrow'
					: days === -1
						? 'Yesterday'
						: `${moment.weekday} ${moment.day} ${moment.month}` +
							(moment.year === today.year ? '' : ` ${moment.year}`);
		return `${day}, ${moment.time}`;
	}

	caption(schedule: Schedule, viewer: ScheduleViewer): string {
		const parts = [
			this.describe(schedule.recurrence),
			...(schedule.timeZone === viewer.timeZone ? [] : [this.zoneName(schedule.timeZone)]),
			schedule.executionMode === 'approval_required' ? 'Asks first' : 'Does not ask'
		];
		if (schedule.status === 'active')
			parts.push(
				`Next: ${this.lowerFirst(this.when(schedule.nextRunAt, schedule.timeZone, viewer.now))}`
			);
		if (schedule.status === 'finished') parts.push('Finished');
		return parts.join(' · ');
	}

	standing(schedule: Schedule, waiting: boolean, now: DateTime): string {
		switch (schedule.status) {
			case 'paused':
				return 'Paused.';
			case 'finished':
				return 'Finished. Its time has passed.';
			case 'active': {
				const next = `Next: ${this.lowerFirst(this.when(schedule.nextRunAt, schedule.timeZone, now))}.`;
				return waiting ? `${next} It is skipped if a run still waits for you then.` : next;
			}
		}
	}

	preview(next: NextOccurrence, timeZone: IanaTimeZone, now: DateTime): string {
		if (next.kind === 'none') return 'This time has passed.';
		return `Next: ${this.lowerFirst(this.when(next.at, timeZone, now))}.`;
	}

	runState(
		occurrence: Pick<ScheduleOccurrence, 'openedAt'>,
		run: {
			readonly status: AgentRunStatus;
			readonly updatedAt: DateTime;
			readonly pendingChanges: number;
		}
	): ScheduledRunState {
		switch (run.status) {
			case 'queued':
			case 'running':
			case 'cancelling':
				return { kind: 'working' };
			case 'awaiting_approval':
				return { kind: 'waiting', changes: run.pendingChanges };
			case 'completed':
			case 'failed':
			case 'cancelled':
				return {
					kind: 'finished',
					outcome: run.status,
					// Opened before the run ended is not opened: the result arrived afterwards.
					opened: occurrence.openedAt !== undefined && occurrence.openedAt >= run.updatedAt
				};
		}
	}

	line(state: ScheduledRunState, failure: string | undefined, answer: string | undefined): string {
		switch (state.kind) {
			case 'working':
				return 'Running now.';
			case 'waiting':
				return state.changes === 1
					? 'Wants to make 1 change. Waiting for you.'
					: `Wants to make ${state.changes} changes. Waiting for you.`;
			case 'finished':
				if (state.outcome === 'failed') return failure ?? 'The run failed.';
				if (state.outcome === 'cancelled') return 'Stopped before it finished.';
				return (answer && this.firstSentence(answer)) || 'Finished without an answer.';
		}
	}

	ranAt(
		occurrence: Pick<ScheduleOccurrence, 'createdAt' | 'scheduledFor' | 'trigger'>,
		timeZone: IanaTimeZone,
		now: DateTime
	): string {
		const started = this.when(occurrence.createdAt, timeZone, now);
		const due = this.local(occurrence.scheduledFor, timeZone);
		const late =
			occurrence.trigger === 'recurrence' &&
			this.local(occurrence.createdAt, timeZone).minuteNumber !== due.minuteNumber;
		return late ? `${started} · due ${due.time}` : started;
	}

	/**
	 * The first sentence of the first line of prose, without Markdown markers. A heading names
	 * the answer and says nothing, so it is used only when the answer is nothing but headings.
	 */
	private firstSentence(answer: string): string | undefined {
		const lines = answer
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		const line = lines.find((candidate) => !candidate.startsWith('#')) ?? lines[0];
		if (!line) return undefined;
		const prose = line
			.replace(/^[#>*\-\s\d.)]+/, '')
			.replaceAll(/[*_`]/g, '')
			.trim();
		const end = prose.search(/[.!?](\s|$)/);
		return end === -1 ? prose : prose.slice(0, end + 1);
	}

	private clock(time: TimeOfDay): string {
		return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
	}

	private ordinal(day: number): string {
		const suffix =
			day % 10 === 1 && day !== 11
				? 'st'
				: day % 10 === 2 && day !== 12
					? 'nd'
					: day % 10 === 3 && day !== 13
						? 'rd'
						: 'th';
		return `${day}${suffix}`;
	}

	private lowerFirst(text: string): string {
		return /^(Today|Tomorrow|Yesterday)/.test(text)
			? text.charAt(0).toLowerCase() + text.slice(1)
			: text;
	}

	/** A calendar date as a person reads it. The date has no time zone, so UTC reads it back. */
	private dateOf(date: string): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: 'UTC',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(`${date}T00:00:00.000Z`));
	}

	private local(instant: DateTime, timeZone: IanaTimeZone) {
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(instant));
		const part = (type: Intl.DateTimeFormatPartTypes) =>
			parts.find((candidate) => candidate.type === type)?.value ?? '';
		const numeric = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(instant));
		const time = `${part('hour')}:${part('minute')}`;
		return {
			weekday: part('weekday'),
			day: part('day'),
			month: part('month'),
			year: part('year'),
			time,
			/** The local calendar day as a number, for counting days between two moments. */
			dayNumber: Date.parse(`${numeric}T00:00:00.000Z`),
			minuteNumber: Date.parse(`${numeric}T${time}:00.000Z`)
		};
	}
}
