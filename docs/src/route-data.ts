import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

/*
 * Starlight has no way to link a sidebar group header to a page. The Reference
 * dropdown groups (Models, Repositories, ...) get their intro page attached
 * here, and docs/src/components/sidebar.astro renders a group header that
 * carries `href` as a link.
 */
const base = import.meta.env.BASE_URL;

const GROUP_PAGE_LINKS = new Map<string, string>([
	['Models', `${base}reference/models/`],
	['Repositories', `${base}reference/repositories/`],
	['Services', `${base}reference/services/`],
	['Controllers', `${base}reference/controllers/`],
	['Capability factories', `${base}reference/factories/`]
]);

interface SidebarLinkData {
	type: 'link';
	label: string;
	href: string;
	isCurrent: boolean;
}

interface SidebarGroupData {
	type: 'group';
	label: string;
	href?: string;
	entries: (SidebarLinkData | SidebarGroupData)[];
	collapsed?: boolean;
}

function attachGroupLinks(entries: (SidebarLinkData | SidebarGroupData)[]): void {
	for (const entry of entries) {
		if (entry.type !== 'group') continue;
		const href = GROUP_PAGE_LINKS.get(entry.label);
		if (href !== undefined) entry.href = href;
		attachGroupLinks(entry.entries);
	}
}

export const onRequest = defineRouteMiddleware((context, next) => {
	return next().then(() => {
		attachGroupLinks(context.locals.starlightRoute.sidebar as unknown as SidebarGroupData[]);
	});
});
