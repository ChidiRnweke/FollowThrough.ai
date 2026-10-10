import type { AgentRunReceipt } from '$lib/models/agent';
import type {
	WorkspaceBindingState,
	NoteActionBinding,
	SelectionSubmissionStorage,
	DiagramSubmissionStorage,
	NoteSubmissionRemote,
	NoteSubmissionIdentity,
	NoteReviewRemote
} from '$lib/models/browser-workspace';
import type { NoteActionIdentities } from '$lib/services/notes/action-identities';
import type { NoteActionState } from '$lib/stores/notes/note-actions.svelte';
import type { DrawioDiagram, DiagramActionInput } from '$lib/models/diagrams';
import type { Suggestion, SuggestionId } from '$lib/models/suggestions';
import type { Note, TextSelection, SelectionAction } from '$lib/models/notes';

export interface NoteActionsController {
	readonly running: boolean;
	readonly lastError: string | undefined;
	extractPromises(selection: TextSelection): Promise<AgentRunReceipt | undefined>;
	relate(selection: TextSelection): Promise<AgentRunReceipt | undefined>;
	findReferences(selection: TextSelection): Promise<AgentRunReceipt | undefined>;
	generateDiagram(selection: TextSelection): Promise<AgentRunReceipt | undefined>;
	reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string,
		renderedPngDataUrl?: string
	): Promise<AgentRunReceipt | undefined>;
	convertDiagram(
		noteId: Note['id'],
		source: string,
		instruction?: string
	): Promise<AgentRunReceipt | undefined>;
	acceptDrawio(
		noteId: Note['id'],
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	): Promise<DrawioDiagram | undefined>;
	rejectDrawio(suggestionId: SuggestionId): Promise<Suggestion | undefined>;
}
export class NoteActions implements NoteActionsController {
	constructor(
		private readonly state: NoteActionState,
		private readonly session: Pick<WorkspaceBindingState, 'accountId' | 'generation'>,
		private readonly selections: SelectionSubmissionStorage,
		private readonly diagrams: DiagramSubmissionStorage,
		private readonly identities: NoteActionIdentities,
		private readonly remote: NoteSubmissionRemote,
		private readonly identity: NoteSubmissionIdentity,
		private readonly reviews: NoteReviewRemote
	) {}
	private active(binding: NoteActionBinding): boolean {
		return (
			binding.accountId === this.session.accountId && binding.generation === this.session.generation
		);
	}
	get running(): boolean {
		const binding = this.state.binding;
		return binding !== undefined && this.active(binding) && this.state.running;
	}
	get lastError(): string | undefined {
		const binding = this.state.binding;
		return binding !== undefined && this.active(binding) ? this.state.lastError : undefined;
	}
	private async attempt<T>(
		fn: () => Promise<T>
	): Promise<{ kind: 'success'; value: T } | { kind: 'failure'; message: string }> {
		try {
			return { kind: 'success', value: await fn() };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The request failed.'
			};
		}
	}
	private async call<T>(
		fn: (accountId: string) => Promise<T>,
		{ run = false }: { run?: boolean } = {}
	): Promise<T | undefined> {
		const accountId = this.session.accountId;
		if (accountId === null) {
			this.state.reset({ accountId, generation: this.session.generation });
			const token = this.state.begin(false);
			this.state.fail(token, 'Open the workspace before running a note action.');
			this.state.finish(token);
			return undefined;
		}
		const binding = { accountId, generation: this.session.generation };
		const previous = this.state.binding;
		if (previous === undefined || !this.active(previous)) this.state.reset(binding);
		const token = this.state.begin(run);
		try {
			const outcome = await this.attempt(() => fn(accountId));
			if (!this.active(binding)) return undefined;
			if (outcome.kind === 'failure') {
				this.state.fail(token, outcome.message);
				return undefined;
			}
			return outcome.value;
		} finally {
			if (this.active(binding)) this.state.finish(token);
		}
	}

	/** Persist intent before transport; acknowledge only this request against its captured account. */
	private async selection(
		accountId: string,
		action: SelectionAction,
		input: TextSelection
	): Promise<AgentRunReceipt> {
		const saved = this.selections.read(accountId, action);
		const candidate = { requestId: this.identity.create(), selection: input };
		const request = this.identities.selection(saved, candidate);
		if (request === candidate) this.selections.write(accountId, action, [...saved, request]);
		const receipt = await this.remote.selection(action, request);
		this.selections.write(
			accountId,
			action,
			this.selections.read(accountId, action).filter((item) => item.requestId !== request.requestId)
		);
		return receipt;
	}
	private async diagram(accountId: string, input: DiagramActionInput): Promise<AgentRunReceipt> {
		const saved = this.diagrams.read(accountId);
		const candidate = this.diagrams.candidate(input, this.identity.create());
		const request = this.identities.diagram(saved, candidate);
		if (request === candidate) this.diagrams.write(accountId, [...saved, request]);
		const receipt = await this.remote.diagram(request);
		this.diagrams.write(
			accountId,
			this.diagrams.read(accountId).filter((item) => item.requestId !== request.requestId)
		);
		return receipt;
	}

	extractPromises(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.selection(accountId, 'promises', selection);
		});
	}
	relate(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.selection(accountId, 'relate', selection);
		});
	}
	findReferences(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.selection(accountId, 'reference', selection);
		});
	}
	generateDiagram(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.diagram(accountId, {
				operation: 'generate',
				selection
			});
		});
	}
	reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string,
		renderedPngDataUrl?: string
	): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.diagram(accountId, {
				operation: 'revise',
				noteId,
				source,
				instruction,
				renderedPngDataUrl
			});
		});
	}

	convertDiagram(
		noteId: Note['id'],
		source: string,
		instruction?: string
	): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async (accountId) => {
			return this.diagram(accountId, {
				operation: 'convert',
				noteId,
				source,
				instruction
			});
		});
	}

	async acceptDrawio(
		noteId: Note['id'],
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	): Promise<DrawioDiagram | undefined> {
		return this.call<DrawioDiagram>(
			async () => {
				const accepted = await this.reviews.accept({
					suggestionId,
					drawioReview: { noteId, source, renderedSvg }
				});
				if (accepted.suggestion.kind !== 'diagram' || accepted.suggestion.payload.kind !== 'drawio')
					throw new Error('The accepted suggestion did not create the expected draw.io diagram.');
				if (!('kind' in accepted.artifact) || accepted.artifact.kind !== 'drawio')
					throw new Error('The accepted suggestion did not create the expected draw.io diagram.');
				return accepted.artifact;
			},
			{ run: true }
		);
	}

	rejectDrawio(suggestionId: SuggestionId): Promise<Suggestion | undefined> {
		return this.call(() => this.reviews.reject({ suggestionId }), { run: true });
	}
}
