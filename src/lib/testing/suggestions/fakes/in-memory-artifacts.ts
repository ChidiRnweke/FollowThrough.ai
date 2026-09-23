import { InMemoryApplicationEffects } from './in-memory-application-effects';
import type { ActorContext } from '$lib/models/identity';
import type { Todo } from '$lib/models/todos';
import { ExternalServiceError, OwnershipError } from '$lib/errors';
import type { TodoCreator } from '$lib/server/services/todos/contracts';
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

	async create(actor: ActorContext, artifact: Todo): Promise<Todo> {
		if (this.failApply) throw new ExternalServiceError('Artifact application failed');
		if (artifact.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s task');
		this.effects.put({ type: 'todos', value: artifact });
		return artifact;
	}

	snapshot(): RestoreSnapshot {
		return this.effects.snapshot();
	}
}
