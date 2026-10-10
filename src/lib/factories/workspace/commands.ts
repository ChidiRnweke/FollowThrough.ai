import { DiagramEditingService } from '$lib/services/diagrams/editing';
import { DiagramLifecycleService } from '$lib/services/diagrams/trash';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { NoteLifecycleService } from '$lib/services/notes/lifecycle';
import { NoteEditingService } from '$lib/services/notes/editing';
import { ProjectDetailService } from '$lib/services/projects/details';
import { MemoryEditingService } from '$lib/services/memory/edits';
import {
	WorkspaceCommands,
	type WorkspaceCommandController
} from '$lib/controllers/workspace/commands';
import { WidgetLifecycleService } from '$lib/services/widgets/trash';
import { createWidgetEditingController } from '$lib/factories/widgets/editing';
export const createWorkspaceCommands = (): WorkspaceCommandController =>
	new WorkspaceCommands(
		new DiagramEditingService(),
		new DiagramLifecycleService(),
		new SkillMetadataEditingService(),
		new TodoEditingRulesService(),
		new TodoEditingRulesService(),
		createWidgetEditingController(),
		new WidgetLifecycleService(),
		new MemoryEditingService(),
		new ProjectDetailService(),
		new NoteLifecycleService(),
		new NoteLifecycleService(),
		new NoteEditingService()
	);
