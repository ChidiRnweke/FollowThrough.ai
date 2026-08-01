import type { ArtifactView } from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';
import { AppFactory } from '$lib/server/app-factory';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;

const pageUrl = (projectId: ProjectId, query: string, page: number): string => {
	const params = new URLSearchParams({ projectId });
	if (query) params.set('q', query);
	if (page > 1) params.set('page', String(page));
	return `/artifacts?${params}`;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const projectId = url.searchParams.get('projectId') as ProjectId | null;
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);

	let artifacts: readonly ArtifactView[] = [];
	let total = 0;
	let project;
	if (projectId) {
		const [result, projectView] = await Promise.all([
			factory.deliverables().listArtifacts(actor, projectId, {
				...(query ? { query } : {}),
				limit: PAGE_SIZE,
				offset: (page - 1) * PAGE_SIZE
			}),
			factory.projects().get(actor, { projectId })
		]);
		artifacts = result.artifacts;
		total = result.total;
		project = projectView.project;
		const finalPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
		const canonical = pageUrl(projectId, query, Math.min(page, finalPage));
		if (`${url.pathname}${url.search}` !== canonical) redirect(303, canonical);
	}

	return {
		artifacts,
		total,
		query,
		page,
		pageSize: PAGE_SIZE,
		selectedProjectId: projectId,
		project
	};
};
