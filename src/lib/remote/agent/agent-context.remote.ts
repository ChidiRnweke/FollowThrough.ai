import { z } from 'zod';
import { query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { ProjectId } from '$lib/models/projects';

const projectIdSchema = z.uuid().transform((value) => value as ProjectId);

/**
 * Counts behind the agent context bar.
 *
 * One round trip per scope change, because the bar re-derives on every
 * navigation and three separate list calls would be three waterfalls. Memory and
 * attachments still length their lists — neither has a count query yet, and both
 * are small per project. Todos count properly.
 *
 * Note counts are not here: `shell.noteTree` is already in the client, so the
 * bar filters it locally rather than paying for a query. Artifacts are not here
 * either: the bar reports what the agent reads, and artifacts are its output.
 */
export const getCapabilityCounts = query(
	z.object({ projectId: projectIdSchema.optional() }),
	async ({ projectId }): Promise<Record<'memory' | 'attachments' | 'todos', number>> => {
		const factory = AppFactory.controllers();
		const actor = requestActor();
		// Profile-level memory is the only capability that means something without
		// a project in scope; the rest are project-bound and read zero.
		const [memory, attachments, todos] = await Promise.all([
			factory
				.memory()
				.list(actor, { projectId, sharedOnly: true })
				.then((output) => output.entries.length),
			projectId
				? factory
						.attachments()
						.listForProject(actor, projectId)
						.then((views) => views.length)
				: Promise.resolve(0),
			projectId
				? factory.todos().count(actor, { projectId, status: 'open' })
				: Promise.resolve(0)
		]);

		return { memory, attachments, todos };
	}
);
