import { command } from '$app/server';
import {
	createScheduleSchema,
	scheduleTargetSchema,
	setScheduleExecutionModeSchema,
	updateScheduleSchema
} from '$lib/models/schedules';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

const schedules = () => AppFactory.forActor(requestActor()).schedules();

// The browser reads schedules from its synchronized workspace, so these are commands only.
// The caller refreshes the workspace with `workspaceSession.serverChange`.

export const createSchedule = command(createScheduleSchema, async (input) =>
	schedules().create(input)
);

export const updateSchedule = command(updateScheduleSchema, async (input) =>
	schedules().update(input)
);

export const pauseSchedule = command(scheduleTargetSchema, async (input) =>
	schedules().pause(input)
);

export const resumeSchedule = command(scheduleTargetSchema, async (input) =>
	schedules().resume(input)
);

export const setScheduleExecutionMode = command(setScheduleExecutionModeSchema, async (input) =>
	schedules().setExecutionMode(input)
);

export const deleteSchedule = command(scheduleTargetSchema, async (input) =>
	schedules().remove(input)
);
