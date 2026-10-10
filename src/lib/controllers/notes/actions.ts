import type { AgentRunReceipt } from '$lib/models/agent';
import type { NoteSubmissionController } from '$lib/controllers/notes/submissions';
import type { NoteActionStore } from '$lib/stores/notes/note-actions.svelte';
import type { DrawioDiagram } from '$lib/models/diagrams';
import type {
	Suggestion,
	SuggestionId,
	SuggestionArtifact,
	AcceptSuggestionOutput
} from '$lib/models/suggestions';
import type { Note, TextSelection } from '$lib/models/notes';

export interface NoteActionSession {
	readonly bootstrap: { readonly accountId: string };
}
export interface NoteActionWorkspace {
	readonly current: NoteActionSession | null;
}
export interface NoteReviewRemote {
	accept(input: {
		suggestionId: SuggestionId;
		drawioReview: { noteId: Note['id']; source: string; renderedSvg: string };
	}): Promise<AcceptSuggestionOutput<SuggestionArtifact>>;
	reject(input: { suggestionId: SuggestionId }): Promise<Suggestion>;
}
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
		private readonly state: NoteActionStore,
		private readonly workspace: NoteActionWorkspace,
		private readonly submissions: NoteSubmissionController,
		private readonly reviews: NoteReviewRemote
	) {}
	get running(): boolean {
		return this.state.binding === this.workspace.current && this.state.running;
	}
	get lastError(): string | undefined {
		return this.state.binding === this.workspace.current ? this.state.lastError : undefined;
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
		fn: () => Promise<T>,
		{ run = false }: { run?: boolean } = {}
	): Promise<T | undefined> {
		const binding = this.workspace.current;
		if (this.state.binding !== binding) this.state.reset(binding);
		const token = this.state.begin(run);
		try {
			const outcome = await this.attempt(fn);
			if (this.workspace.current !== binding) return undefined;
			if (outcome.kind === 'failure') {
				this.state.fail(token.generation, outcome.message);
				return undefined;
			}
			return outcome.value;
		} finally {
			this.state.finish(token);
		}
	}

	extractPromises(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to extract promises');
			const accountId = session.bootstrap.accountId;
			return this.submissions.selection(accountId, 'promises', selection);
		});
	}
	relate(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to find related notes');
			const accountId = session.bootstrap.accountId;
			return this.submissions.selection(accountId, 'relate', selection);
		});
	}
	findReferences(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to search for references');
			const accountId = session.bootstrap.accountId;
			return this.submissions.selection(accountId, 'reference', selection);
		});
	}
	generateDiagram(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to generate a diagram');
			const accountId = session.bootstrap.accountId;
			return this.submissions.diagram(accountId, {
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
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to revise a diagram');
			const accountId = session.bootstrap.accountId;
			return this.submissions.diagram(accountId, {
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
		return this.call<AgentRunReceipt>(async () => {
			const session = this.workspace.current;
			if (!session) throw new Error('The workspace is not ready to convert a diagram');
			const accountId = session.bootstrap.accountId;
			return this.submissions.diagram(accountId, {
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
