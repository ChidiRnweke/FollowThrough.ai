import type { WorkspaceFixture } from '../../lab/workspace';
import type { DiagramExpectations } from '../../assertions/diagram/expectations';

/**
 * One architecture, as source material and as the answer it implies.
 *
 * The note and the expectations are the same fact written twice — once for the
 * agent to read, once for the checks to hold it to — so they live in one file.
 * Split apart they drift, and an expectation that no longer matches its prose
 * grades a diagram against a system nobody described.
 */
export interface DiagramFixture {
	readonly workspace: WorkspaceFixture;
	/** The note the case asks the agent to read; must exist in `workspace`. */
	readonly noteTitle: string;
	readonly expectations: DiagramExpectations;
}

/** The prose the agent reads, as saved. */
export const sourceTextOf = (fixture: DiagramFixture): string => {
	const body = fixture.workspace.projects
		?.flatMap((project) => project.notes ?? [])
		.find((note) => note.title === fixture.noteTitle)?.body;
	if (!body) throw new Error(`Fixture has no note titled "${fixture.noteTitle}".`);
	return body;
};
