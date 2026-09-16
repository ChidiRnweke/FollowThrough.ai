import type { ProjectDetails } from '$lib/models/projects';

export function decideProjectDetails(input: {
	readonly name: string;
	readonly description?: string;
}): { kind: 'invalid'; message: string } | ({ kind: 'details' } & ProjectDetails) {
	const name = input.name.trim();
	return name
		? { kind: 'details', name, description: input.description?.trim() || undefined }
		: { kind: 'invalid', message: 'Project name is required' };
}
