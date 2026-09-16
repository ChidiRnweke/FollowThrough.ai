import type { PendingMemoryNotification } from '$lib/models/memory';
import type { Project } from '$lib/models/projects';
import type { Suggestion } from '$lib/models/suggestions';

/** Profile attention is independent of project inventory; project rows require a visible project. */
export function pendingMemoryNotifications(
	projects: readonly Pick<Project, 'id' | 'name' | 'archivedAt'>[],
	suggestions: readonly Suggestion[]
): readonly PendingMemoryNotification[] {
	const counts = new Map<string | undefined, number>();
	for (const suggestion of suggestions) {
		if (suggestion.kind !== 'memory' || suggestion.status !== 'proposed') continue;
		const projectId = suggestion.payload.projectId;
		counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
	}
	const profileCount = counts.get(undefined);
	return [
		...(profileCount ? [{ label: 'Profile memory', href: '/profile', count: profileCount }] : []),
		...projects.flatMap((project) => {
			const count = counts.get(project.id);
			return !project.archivedAt && count
				? [
						{
							projectId: project.id,
							label: project.name,
							href: `/projects/${project.id}/memory`,
							count
						}
					]
				: [];
		})
	];
}
