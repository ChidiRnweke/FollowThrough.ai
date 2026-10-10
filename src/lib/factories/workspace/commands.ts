import {
	WorkspaceCommands,
	type WorkspaceCommandController
} from '$lib/controllers/workspace/commands';
import { WidgetLifecycleService } from '$lib/services/widgets/trash';
import { createWidgetEditingController } from '$lib/factories/widgets/editing';
export const createWorkspaceCommands = (): WorkspaceCommandController =>
	new WorkspaceCommands(createWidgetEditingController(), new WidgetLifecycleService());
