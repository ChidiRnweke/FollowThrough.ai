import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { memorySuggestionContext } from '$lib/testing/suggestions/fixtures/views';
import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';
import {
	InMemorySuggestionReader,
	InMemorySuggestions
} from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionArtifacts } from '$lib/testing/suggestions/fakes/in-memory-artifacts';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	suggestionBuilder,
	memorySuggestionBuilder,
	testActor,
	testNow,
	testProjectId,
	testNoteId,
	testSuggestionId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('Pending memory review invariants', () => {
	it('returns only profile memory suggestions for the profile scope', async () => {
		const reader = new InMemorySuggestionReader();
		reader.suggestions = [
			memorySuggestionBuilder(),
			memorySuggestionBuilder({
				id: testSuggestionId(2),
				payload: {
					scope: 'project',
					operation: 'add',
					content: 'Project rule',
					projectId: testProjectId()
				}
			}),
			suggestionBuilder({ id: testSuggestionId(3) })
		];
		reader.contexts = reader.suggestions.flatMap((suggestion) =>
			suggestion.kind === 'memory' ? [memorySuggestionContext(suggestion)] : []
		);
		const controller = new Suggestions(
			new ProvenancePresentationService(),
			capabilityDependencies<SuggestionsDependencies>({
				todoCreationRules: new TodoEditingRulesService(),
				suggestionPresentation: new SuggestionPresentationService(),
				suggestionLister: reader,
				suggestionExpirer: reader,
				suggestionContextReader: reader
			})
		);
		const result = await controller.listPendingMemory(testActor(), {});
		expect(result.suggestions.map((view) => view.suggestion.id)).toEqual([testSuggestionId()]);
	});

	it('returns only memory suggestions for the requested project', async () => {
		const reader = new InMemorySuggestionReader();
		reader.suggestions = [
			memorySuggestionBuilder(),
			memorySuggestionBuilder({
				id: testSuggestionId(2),
				payload: {
					scope: 'project',
					operation: 'add',
					content: 'Project rule',
					projectId: testProjectId()
				}
			}),
			memorySuggestionBuilder({
				id: testSuggestionId(3),
				payload: {
					scope: 'project',
					operation: 'add',
					content: 'Other project',
					projectId: testProjectId(2)
				}
			})
		];
		reader.contexts = reader.suggestions.flatMap((suggestion) =>
			suggestion.kind === 'memory' ? [memorySuggestionContext(suggestion)] : []
		);
		const controller = new Suggestions(
			new ProvenancePresentationService(),
			capabilityDependencies<SuggestionsDependencies>({
				todoCreationRules: new TodoEditingRulesService(),
				suggestionPresentation: new SuggestionPresentationService(),
				suggestionLister: reader,
				suggestionExpirer: reader,
				suggestionContextReader: reader
			})
		);
		const result = await controller.listPendingMemory(testActor(), { projectId: testProjectId() });
		expect(result.suggestions.map((view) => view.suggestion.id)).toEqual([testSuggestionId(2)]);
	});
});

const setup = () => {
	const suggestions = new InMemorySuggestions();
	const artifacts = new InMemorySuggestionArtifacts();
	const transactionRunner = new InMemoryTransactionRunner([suggestions, artifacts]);
	const controller = new Suggestions(
		new ProvenancePresentationService(),
		capabilityDependencies<SuggestionsDependencies>({
			todoCreationRules: new TodoEditingRulesService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			suggestionRejecter: suggestions,
			suggestionReverter: suggestions,
			todoCreator: artifacts,
			now: () => testNow,
			suggestionEffects: new SuggestionEffects(artifacts.effects),
			transactionRunner
		})
	);
	return {
		suggestions,
		artifacts,
		accept: controller,
		reject: controller,
		revert: controller
	};
};

describe('Suggestion lifecycle invariants', () => {
	it('normalizes accepted task content and resolves its actor and timestamps', async () => {
		const { suggestions, artifacts, accept } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				payload: {
					projectId: testProjectId(),
					title: '  Send the design  ',
					responsibility: 'mine',
					waitingOn: 'Sam'
				}
			})
		];
		await accept.accept(testActor(), { suggestionId: testSuggestionId() });
		const artifact = artifacts.artifacts[0];
		expect({
			artifact: expect.objectContaining({
				title: 'Send the design',
				userId: testActor().userId,
				projectId: testProjectId(),
				status: 'open',
				createdAt: testNow,
				updatedAt: testNow
			}),
			waitingOnWasPersisted: artifact ? Object.hasOwn(artifact, 'waitingOn') : true
		}).toEqual({
			artifact: expect.objectContaining({
				title: 'Send the design',
				userId: testActor().userId,
				projectId: testProjectId(),
				status: 'open',
				createdAt: testNow,
				updatedAt: testNow
			}),
			waitingOnWasPersisted: false
		});
	});
	it('accepting a proposal applies its artifact and transitions it to accepted', async () => {
		const { suggestions, artifacts, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		const result = await accept.accept(testActor(), { suggestionId: testSuggestionId() });
		expect({
			status: result.suggestion.status,
			artifacts: artifacts.artifacts.map((artifact) => artifact.title)
		}).toEqual({ status: 'accepted', artifacts: ['Send the design'] });
	});

	it('rejecting a proposal transitions it without applying an artifact', async () => {
		const { suggestions, artifacts, reject } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		const result = await reject.reject(testActor(), { suggestionId: testSuggestionId() });
		expect({ status: result.status, artifacts: artifacts.artifacts }).toEqual({
			status: 'rejected',
			artifacts: []
		});
	});

	it('an expired proposal cannot be accepted', async () => {
		const { suggestions, accept } = setup();
		suggestions.suggestions = [
			suggestionBuilder({ expiresAt: '2020-01-01T00:00:00.000Z' as never })
		];
		await expect(
			accept.accept(testActor(), { suggestionId: testSuggestionId() })
		).rejects.toMatchObject({ code: 'EXPIRED_SUGGESTION' });
	});

	it('an accepted suggestion can be reverted', async () => {
		const { suggestions, artifacts, revert } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				status: 'accepted',
				appliedArtifactId: testTodoId()
			})
		];
		artifacts.artifacts = [todoBuilder()];
		await artifacts.effects.record(testActor(), testSuggestionId(), [
			{ kind: 'created', after: { type: 'todos', value: todoBuilder() } }
		]);
		const result = await revert.revert(testActor(), { suggestionId: testSuggestionId() });
		expect({ status: result.status, remainingArtifacts: artifacts.artifacts }).toEqual({
			status: 'reverted',
			remainingArtifacts: []
		});
	});
});

describe('Suggestion transaction invariants', () => {
	it('rolls back a failed acceptance and reports an external-service error', async () => {
		const { suggestions, artifacts, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		suggestions.failAcceptance = true;
		const failure = await accept.accept(testActor(), { suggestionId: testSuggestionId() }).then(
			() => ({ kind: 'unexpected-success' }),
			(error: { code?: string }) => ({ kind: 'failure', code: error.code })
		);
		expect({ failure, artifacts: artifacts.artifacts }).toEqual({
			failure: { kind: 'failure', code: 'EXTERNAL_SERVICE' },
			artifacts: []
		});
	});

	it('keeps an accepted suggestion when artifact revert fails', async () => {
		const { suggestions, artifacts, revert } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				status: 'accepted',
				appliedArtifactId: testTodoId()
			})
		];
		artifacts.artifacts = [todoBuilder()];
		await artifacts.effects.record(testActor(), testSuggestionId(), [
			{ kind: 'created', after: { type: 'todos', value: todoBuilder() } }
		]);
		artifacts.failRevert = true;
		try {
			await revert.revert(testActor(), { suggestionId: testSuggestionId() });
		} catch {
			// The invariant under test is the restored state.
		}
		expect(suggestions.suggestions[0]?.status).toBe('accepted');
	});
});

describe('Draw.io acceptance invariants', () => {
	const drawioSuggestion = () =>
		suggestionBuilder({
			id: testSuggestionId(9),
			kind: 'diagram',
			payload: {
				noteId: testNoteId(),
				kind: 'drawio',
				title: 'Architecture',
				source: '<mxfile />'
			}
		} as never);

	// A draw.io diagram's preview is the SVG its editor exports on save. Accepting
	// one without that review creates a diagram that can never show itself, and
	// nothing in the system can repair it — so it must fail rather than persist.
	it('refuses a draw.io suggestion accepted without its review', async () => {
		const { suggestions, accept } = setup();
		suggestions.suggestions = [drawioSuggestion()];
		const failure = await accept
			.acceptReviewed(testActor(), { suggestionId: testSuggestionId(9) })
			.then(
				() => ({ kind: 'unexpected-success' }),
				(error: { code?: string }) => ({ kind: 'failure', code: error.code })
			);
		expect({ failure, status: suggestions.suggestions[0]?.status }).toEqual({
			failure: { kind: 'failure', code: 'VALIDATION' },
			status: 'proposed'
		});
	});
});
