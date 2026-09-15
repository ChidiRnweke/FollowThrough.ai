import { InMemoryApplicationEffects } from './in-memory-application-effects';
import type { Suggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type { Todo } from '$lib/models/todos';
import { ExternalServiceError } from '$lib/errors';
import type { SuggestionArtifactApplier } from '$lib/server/controllers/suggestions/controller';
import { testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemorySuggestionArtifacts implements SuggestionArtifactApplier, SnapshotParticipant {
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

	async apply(
		actor: ActorContext,
		suggestion: Suggestion
	): Promise<Awaited<ReturnType<SuggestionArtifactApplier['apply']>>> {
		if (this.failApply) throw new ExternalServiceError('Artifact application failed');
		if (suggestion.kind !== 'todo') throw new ExternalServiceError('Unsupported test artifact');
		const artifact = todoBuilder({
			id: testTodoId(this.artifacts.length + 1),
			userId: actor.userId,
			projectId: suggestion.payload.projectId ?? todoBuilder().projectId,
			title: suggestion.payload.title,
			responsibility: suggestion.payload.responsibility
		});
		this.effects.put({ type: 'todos', value: artifact });
		return { artifact, changes: [{ kind: 'created', after: { type: 'todos', value: artifact } }] };
	}

	snapshot(): RestoreSnapshot {
		return this.effects.snapshot();
	}
}
