import type { Database } from '$lib/server/db';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import { WidgetRecords } from '$lib/server/repositories/widgets/postgres/widgets';
import { WidgetLibrary } from '$lib/server/services/widgets/library';

export interface WidgetsCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
}

export interface WidgetsCapability {
	readonly library: WidgetLibrary;
}

export const createWidgetsCapability = (input: WidgetsCapabilityInput): WidgetsCapability => ({
	library: new WidgetLibrary(new WidgetRecords(input.db), input.projects)
});
