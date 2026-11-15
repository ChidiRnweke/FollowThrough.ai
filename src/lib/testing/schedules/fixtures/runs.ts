import type { Schedule } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import { ScheduleLibrary } from '$lib/server/services/schedules/library';
import { ScheduleRuns } from '$lib/server/services/schedules/runs';
import { ScheduleRules } from '$lib/services/schedules/rules';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import {
	InMemoryScheduleOccurrenceRepository,
	InMemoryScheduleRepository,
	InMemoryScheduleTable
} from '$lib/testing/schedules/fakes/in-memory-schedules';
import { scheduleStartFixture } from '$lib/testing/schedules/fixtures/start';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

/**
 * The agent harness with one user's saved schedules beside it, as the worker reaches it. The
 * clock is the spec's, so a spec decides when a schedule comes due.
 */
export const scheduledRunsFixture = (
	saved: readonly Schedule[],
	now: DateTime,
	phase: Parameters<typeof agentSubmissionFixture>[0] = 'queued'
) => {
	const clock = { now };
	const table = new InMemoryScheduleTable();
	table.rows = saved;
	const occurrences = new InMemoryScheduleOccurrenceRepository(
		(runId) => harness.runs.runs.find((run) => run.id === runId)?.status
	);
	// What a schedule can name, so a spec can take one away before the run starts.
	const start = scheduleStartFixture(testActor());
	const harness = agentSubmissionFixture(
		phase,
		{},
		{
			now: () => clock.now,
			contextProjects: start.projects,
			contextSkills: start.skills,
			schedules: new ScheduleLibrary(new InMemoryScheduleRepository(testActor(), table)),
			scheduleRules: new ScheduleRules(),
			scheduleRuns: new ScheduleRuns(occurrences)
		}
	);
	harness.models.models = start.models.models;
	return {
		...harness,
		clock,
		schedules: table,
		occurrences,
		projects: start.projects,
		skills: start.skills
	};
};
