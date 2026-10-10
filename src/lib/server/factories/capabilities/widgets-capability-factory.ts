import { createWidgetRules, type WidgetRules } from '$lib/factories/widgets/rules';
import type {
	WidgetReader,
	WidgetLister,
	WidgetWriter
} from '$lib/server/services/widgets/library';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { Database } from '$lib/server/db';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import { WidgetRecords } from '$lib/server/repositories/widgets/postgres/widgets';
import { WidgetLibrary } from '$lib/server/services/widgets/library';

export interface WidgetsCapabilityInput {
	readonly notes: NoteRepository;
	readonly db: Database;
	readonly projects: ProjectRepository;
}

export interface WidgetsCapability extends WidgetRules {
	readonly reader: WidgetReader;
	readonly lister: WidgetLister;
	readonly writer: WidgetWriter;
}

export const createWidgetsCapability = (input: WidgetsCapabilityInput): WidgetsCapability => {
	const library = new WidgetLibrary(new WidgetRecords(input.db), input.projects, input.notes);
	return { reader: library, lister: library, writer: library, ...createWidgetRules() };
};
