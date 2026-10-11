import type { ProjectDetails } from '$lib/models/projects';

function decideProjectDetails(input: {
	readonly name: string;
	readonly description?: string;
}): { kind: 'invalid'; message: string } | ({ kind: 'details' } & ProjectDetails) {
	const name = input.name.trim();
	return name
		? { kind: 'details', name, description: input.description?.trim() || undefined }
		: { kind: 'invalid', message: 'Project name is required' };
}

export interface ProjectDetailRules {
	decide(input: {
		readonly name: string;
		readonly description?: string;
	}): { kind: 'invalid'; message: string } | ({ kind: 'details' } & ProjectDetails);
}
export class ProjectDetailService implements ProjectDetailRules {
	decide(input: { readonly name: string; readonly description?: string }) {
		return decideProjectDetails(input);
	}
}
