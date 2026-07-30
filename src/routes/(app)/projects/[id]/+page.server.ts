import type { ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { todayLocalDate } from '$lib/components/app/labels';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const projectId = params.id as ProjectId;
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);

	const [view, todosResult, memoryResult, artifactsResult, attachments] = await Promise.all([
		factory.projects().get(actor, { projectId }),
		factory.todos().list(actor, { projectId, status: 'open' }),
		factory.memory().list(actor, { projectId }),
		factory.deliverables().listArtifacts(actor, projectId),
		factory.attachments().listForProject(actor, projectId)
	]);

	// Overdue is a clock comparison, so it happens here rather than in a $derived.
	// Reading the clock during render reads it twice — once for SSR, once during
	// hydration — and the two can disagree.
	const today = todayLocalDate();
	const overdueTodoCount = todosResult.todos.filter(
		(entry) => entry.todo.dueDate !== undefined && entry.todo.dueDate < today
	).length;

	return {
		view,
		overdueTodoCount,
		// The documents list renders relative timestamps. Both the SSR pass and
		// hydration format against this one instant so their markup matches.
		renderedAt: new Date().toISOString(),
		// Chosen once, on the server, and serialised: a seed drawn at render time
		// would differ between the SSR pass and hydration.
		tipSeed: Math.floor(Math.random() * 1000),
		counts: {
			todos: todosResult.todos.length,
			memory: memoryResult.entries.length,
			artifacts: artifactsResult.total,
			attachments: attachments.length
		}
	};
};
