import type { AgentController } from '../agent/controller';
import type { TodosController } from '../todos/controller';
import type { ReferencesController } from '../references/controller';
import type { RelationshipsController } from '../relationships/controller';
import type { DiagramsController } from '../diagrams/controller';

export interface StartupController {
	recoverInterruptedRuns(): Promise<number>;
}
export interface StartupDependencies {
	readonly agent: Pick<AgentController, 'recoverInterruptedRuns'>;
	readonly todos: Pick<TodosController, 'recoverQueuedPromiseRuns'>;
	readonly references: Pick<ReferencesController, 'recoverQueuedReferenceRuns'>;
	readonly relationships: Pick<RelationshipsController, 'recoverQueuedRelatedNoteRuns'>;
	readonly diagrams: Pick<DiagramsController, 'recoverQueuedDiagramRuns'>;
}
export class Startup implements StartupController {
	constructor(private readonly dependencies: StartupDependencies) {}
	async recoverInterruptedRuns(): Promise<number> {
		const interrupted = await this.dependencies.agent.recoverInterruptedRuns();
		return (
			interrupted +
			(await this.dependencies.todos.recoverQueuedPromiseRuns()) +
			(await this.dependencies.references.recoverQueuedReferenceRuns()) +
			(await this.dependencies.relationships.recoverQueuedRelatedNoteRuns()) +
			(await this.dependencies.diagrams.recoverQueuedDiagramRuns())
		);
	}
}
