import type { ActorContext } from '$lib/models/identity';
import type { RelationshipClassification } from '$lib/models/relationships';
import type { PipelineKind } from '$lib/models/agent';
import type { PromiseCandidate } from '$lib/models/todos';
import { asProvenance, type Provenance, type ProvenanceRequest } from '$lib/models/provenance';
import type { ReferenceCandidate, ReferenceSource } from '$lib/models/references';
import type { Suggestion } from '$lib/models/suggestions';
import type { TextSelection } from '$lib/models/notes';
import type { StructuredRelationshipClient } from '$lib/server/services/relationships/contracts';
import type {
	PromiseExtractor,
	StructuredPromiseClient,
	StructuredPromiseResult
} from '$lib/server/services/todos/promise-extraction/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type {
	ReferenceFinder,
	ReferenceSearchOptions,
	WebReferenceClient
} from '$lib/server/services/references/contracts';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';
import { testNow, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryPromiseExtractor implements PromiseExtractor {
	candidates: PromiseCandidate[] = [];
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> = Promise.resolve();
	readonly modelCandidates = new Map<string, readonly PromiseCandidate[]>();

	async extract(
		_actor: ActorContext,
		_selection: TextSelection,
		context: Parameters<PromiseExtractor['extract']>[2],
		_signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		void _actor;
		void _selection;
		void _signal;
		this.started.resolve();
		await this.completion;
		return this.modelCandidates.get(context.model) ?? this.candidates;
	}
}

export class InMemoryStructuredPromiseClient implements StructuredPromiseClient {
	result?: readonly StructuredPromiseResult[];
	failure?: Error;

	async extract(_text: string): Promise<readonly StructuredPromiseResult[] | undefined> {
		void _text;
		if (this.failure) throw this.failure;
		return this.result;
	}
}

export class InMemoryStructuredRelationshipClient implements StructuredRelationshipClient {
	result?: RelationshipClassification;
	failure?: Error;
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> = Promise.resolve();
	readonly modelResults = new Map<string, RelationshipClassification>();

	async classify(
		_sourceText: string,
		_targetText: string,
		model: string
	): Promise<RelationshipClassification | undefined> {
		void _sourceText;
		void _targetText;
		this.started.resolve();
		await this.completion;
		if (this.failure) throw this.failure;
		return this.modelResults.get(model) ?? this.result;
	}
}

export class InMemoryReferencePipeline implements ReferenceFinder {
	candidates: ReferenceCandidate[] = [];
	model?: string;
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> = Promise.resolve();
	readonly modelCandidates = new Map<string, readonly ReferenceCandidate[]>();
	async find(
		_actor: ActorContext,
		_selection: TextSelection,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[]> {
		void _actor;
		void _selection;
		this.model = options.model;
		this.started.resolve();
		await this.completion;
		return (options.model ? this.modelCandidates.get(options.model) : undefined) ?? this.candidates;
	}
}

export class InMemoryWebReferenceClient implements WebReferenceClient {
	result?: readonly ReferenceSource[];
	failure?: Error;
	model?: string;
	async search(
		_selectionText: string,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceSource[] | undefined> {
		void _selectionText;
		this.model = options.model;
		if (this.failure) throw this.failure;
		return this.result;
	}
}

export class InMemoryProvenanceRecorder implements ProvenanceRecorder, SnapshotParticipant {
	records: Provenance[] = [];

	async record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance> {
		// Built through the model's own parser, exactly as production is, so the
		// fake cannot hold a record production could never produce.
		const provenance = asProvenance(input, {
			id: testProvenanceId(this.records.length + 1),
			userId: actor.userId,
			createdAt: testNow
		});
		this.records.push(provenance);
		return provenance;
	}

	snapshot(): RestoreSnapshot {
		const records = structuredClone(this.records);
		return () => {
			this.records = records;
		};
	}
}

export class InMemoryTrustPolicyEvaluator implements TrustPolicyEvaluator {
	autoAccept = false;

	async shouldAutoAccept(
		_actor: ActorContext,
		pipeline: PipelineKind,
		_suggestion: Suggestion
	): Promise<boolean> {
		void _actor;
		void _suggestion;
		return pipeline !== 'reference' && this.autoAccept;
	}
}
