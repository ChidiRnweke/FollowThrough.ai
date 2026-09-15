import { InMemoryApplicationEffects } from './in-memory-application-effects';
import type { ActorContext } from '$lib/models/identity';
import type { Todo, CreateTodoInput } from '$lib/models/todos';
import { ExternalServiceError } from '$lib/errors';
import type { TodoCreator } from '$lib/server/services/todos/contracts';
import { testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemorySuggestionArtifacts implements TodoCreator, SnapshotParticipant {
	constructor(readonly effects = new InMemoryApplicationEffects()) {}
	get artifacts(): Todo[] {
		return [...this.effects.records.values()].flatMap((record) =>
			record.type === 'todos' && !record.value.deletedAt ? [record.value] : []
		);
	}
	set artifacts(artifacts: Todo[]) {
		for (const artifact of artifacts) this.effects.put({ type: 'todos', value: artifact });
	}
	failApply = false;
	set failRevert(value: boolean) {
		this.effects.failRestore = value;
	}

	async create(actor: ActorContext, input: CreateTodoInput): Promise<Todo> {
		if (this.failApply) throw new ExternalServiceError('Artifact application failed');
		const artifact = todoBuilder({
			id: testTodoId(this.artifacts.length + 1),
			userId: actor.userId,
			projectId: input.projectId ?? todoBuilder().projectId,
			title: input.title,
			responsibility: input.responsibility
		});
		this.effects.put({ type: 'todos', value: artifact });
		return artifact;
	}

	snapshot(): RestoreSnapshot {
		return this.effects.snapshot();
	}
}
