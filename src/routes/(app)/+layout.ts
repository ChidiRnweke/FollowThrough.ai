import type { LayoutLoad } from './$types';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import { parseSidebarWidth } from '$lib/models/workspace';

export const ssr = false;

export const load: LayoutLoad = async () => {
	const session = await workspaceSession.start();
	const cookie = (name: string): string | undefined =>
		document.cookie
			.split(';')
			.map((part) => part.trim())
			.find((part) => part.startsWith(`${name}=`))
			?.slice(name.length + 1);
	return {
		session,
		sidebarOpen: cookie('sidebar_state') !== 'false',
		sidebarWidth: parseSidebarWidth(cookie('sidebar_width'))
	};
};
