import { ProjectTrees, type ProjectTreeController } from '$lib/controllers/projects/tree';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
export const projectTreeController: ProjectTreeController = new ProjectTrees(
	new ProjectTreePresentationService()
);
