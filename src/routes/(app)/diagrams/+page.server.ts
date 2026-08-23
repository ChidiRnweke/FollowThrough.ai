import { redirect } from '@sveltejs/kit';
import type { ProjectId } from '$lib/models/projects';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 12;

/**
 * The canonical URL for a page of results. The gallery builds the same string,
 * so a navigation lands on its final URL rather than bouncing through a redirect.
 */
const pageUrl = (projectId: ProjectId, query: string, page: number): string => {
	const params = new URLSearchParams({ projectId });
	if (query) params.set('q', query);
	if (page > 1) params.set('page', String(page));
	return `/diagrams?${params}`;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const projectId = url.searchParams.get('projectId') as ProjectId | null;
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requested = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
	if (!projectId) {
		return {
			diagrams: [],
			total: 0,
			query,
			page: 1,
			pageSize: PAGE_SIZE,
			selectedProjectId: null
		};
	}
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [result, projectView] = await Promise.all([
		factory.diagramStudio().listProjectDiagrams(actor, {
			projectId,
			// Promotion is what puts a diagram in a project, and it always produces
			// draw.io. A Mermaid row belongs to the note it was generated in.
			kind: 'drawio',
			...(query ? { query } : {}),
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		factory.projects().get(actor, { projectId })
	]);
	// Clamp an over-range page rather than showing an empty grid for it.
	const finalPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
	const canonical = pageUrl(projectId, query, Math.min(page, finalPage));
	if (`${url.pathname}${url.search}` !== canonical) redirect(303, canonical);
	return {
		diagrams: result.diagrams,
		total: result.total,
		query,
		page,
		pageSize: PAGE_SIZE,
		selectedProjectId: projectId,
		project: projectView.project
	};
};
