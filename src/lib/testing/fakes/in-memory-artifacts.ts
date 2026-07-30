import type { AcceptSuggestionOutput, ActorContext, Suggestion, Todo } from '$lib/models';
import { ExternalServiceError } from '$lib/errors';
import type { SuggestionArtifactApplier } from '$lib/server/controllers';
import { testTodoId, todoBuilder } from '../fixtures/domain-builders';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemorySuggestionArtifacts implements SuggestionArtifactApplier, SnapshotParticipant {
	artifacts: Todo[] = [];
	failApply = false;
	failRevert = false;

	async apply(
		actor: ActorContext,
		suggestion: Suggestion
	): Promise<AcceptSuggestionOutput['artifact']> {
		if (this.failApply) throw new ExternalServiceError('Artifact application failed');
		if (suggestion.kind !== 'todo') throw new ExternalServiceError('Unsupported test artifact');
		const artifact = todoBuilder({
			id: testTodoId(this.artifacts.length + 1),
			userId: actor.userId,
			projectId: suggestion.payload.projectId ?? todoBuilder().projectId,
			title: suggestion.payload.title,
			responsibility: suggestion.payload.responsibility
		});
		this.artifacts.push(artifact);
		return artifact;
	}

	async revert(_actor: ActorContext, suggestion: Suggestion): Promise<void> {
		if (this.failRevert) throw new ExternalServiceError('Artifact revert failed');
		this.artifacts = this.artifacts.filter(
			(artifact) => artifact.id !== suggestion.appliedArtifactId
		);
	}

	snapshot(): unknown {
		return structuredClone(this.artifacts);
	}

	restore(snapshot: unknown): void {
		this.artifacts = snapshot as Todo[];
	}
}
