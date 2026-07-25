import { z } from 'zod';
import { query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { ListMemoryInput, ProjectId } from '$lib/models';

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
	z.object({ projectId: z.string().uuid().optional() }),
	async ({ projectId }): Promise<Record<'memory' | 'attachments' | 'todos', number>> => {
		const factory = AppFactory.controllerFactory();
		const actor = requestActor();
		const project = projectId as ProjectId | undefined;

		// Profile-level memory is the only capability that means something without
		// a project in scope; the rest are project-bound and read zero.
		const [memory, attachments, todos] = await Promise.all([
			factory
				.memory()
				.list(actor, { projectId, sharedOnly: true } as ListMemoryInput)
				.then((output) => output.entries.length),
			project
				? factory
						.attachments()
						.listForProject(actor, project)
						.then((views) => views.length)
				: Promise.resolve(0),
			project
				? factory.todos().count(actor, { projectId: project, status: 'open' })
				: Promise.resolve(0)
		]);

		return { memory, attachments, todos };
	}
);
