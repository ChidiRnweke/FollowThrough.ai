import type {
	ActorContext,
	PipelineKind,
	LinkCandidate,
	PromiseCandidate,
	Provenance,
	ReferenceCandidate,
	Suggestion,
	TextSelection
} from '$lib/models';
import type {
	LinkFinder,
	PromiseExtractor,
	ProvenanceRecorder,
	ReferenceFinder,
	ReferenceRanker,
	ReferenceSearchOptions,
	RelationshipClassification,
	StructuredPromiseClient,
	StructuredPromiseResult,
	StructuredRelationshipClient,
	TrustPolicyEvaluator,
	WebReferenceClient
} from '$lib/server/services';
import { testNow, testProvenanceId } from '../fixtures/domain-builders';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryPromiseExtractor implements PromiseExtractor {
	candidates: PromiseCandidate[] = [];

	async extract(
		_actor: ActorContext,
		_selection: TextSelection
	): Promise<readonly PromiseCandidate[]> {
		void _actor;
		void _selection;
		return this.candidates;
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

export class InMemoryLinkFinder implements LinkFinder {
	candidates: LinkCandidate[] = [];
	async find(_actor: ActorContext, _selection: TextSelection): Promise<readonly LinkCandidate[]> {
		void _actor;
		void _selection;
		return this.candidates;
	}
}

export class InMemoryStructuredRelationshipClient implements StructuredRelationshipClient {
	result?: RelationshipClassification;
	failure?: Error;

	async classify(
		_sourceText: string,
		_targetText: string
	): Promise<RelationshipClassification | undefined> {
		void _sourceText;
		void _targetText;
		if (this.failure) throw this.failure;
		return this.result;
	}
}

export class InMemoryReferencePipeline implements ReferenceFinder, ReferenceRanker {
	candidates: ReferenceCandidate[] = [];
	model?: string;
	async find(
		_actor: ActorContext,
		_selection: TextSelection,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[]> {
		void _actor;
		void _selection;
		this.model = options.model;
		return this.candidates;
	}
	async rank(
		_actor: ActorContext,
		_selection: TextSelection,
		candidates: readonly ReferenceCandidate[]
	): Promise<readonly ReferenceCandidate[]> {
		const weight = { official: 0, standard: 1, vendor: 2, community: 3 };
		return [...candidates].sort(
			(a, b) => weight[a.tier] - weight[b.tier] || b.confidence - a.confidence
		);
	}
}

export class InMemoryWebReferenceClient implements WebReferenceClient {
	result?: readonly ReferenceCandidate[];
	failure?: Error;
	model?: string;
	async search(
		_selectionText: string,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[] | undefined> {
		void _selectionText;
		this.model = options.model;
		if (this.failure) throw this.failure;
		return this.result;
	}
}

export class InMemoryProvenanceRecorder implements ProvenanceRecorder, SnapshotParticipant {
	records: Provenance[] = [];

	async record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance> {
		const provenance: Provenance = {
			id: testProvenanceId(this.records.length + 1),
			userId: actor.userId,
			...input,
			createdAt: testNow
		};
		this.records.push(provenance);
		return provenance;
	}

	snapshot(): unknown {
		return structuredClone(this.records);
	}

	restore(snapshot: unknown): void {
		this.records = snapshot as Provenance[];
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
