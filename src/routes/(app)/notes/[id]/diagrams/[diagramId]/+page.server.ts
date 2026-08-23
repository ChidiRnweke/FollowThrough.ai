import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The note-scoped draw.io editor moved to the project studio, where a diagram is
 * edited beside the conversation that produced it. Existing links and bookmarks
 * keep working through this redirect; the diagram itself is the same row.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/diagrams/${params.diagramId}`);
};
