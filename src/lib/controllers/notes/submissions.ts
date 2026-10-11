import type { AgentRunReceipt } from '$lib/models/agent';
import type { SelectionAction, SelectionSubmission, TextSelection } from '$lib/models/notes';
import type { DiagramActionInput, DiagramActionSubmission } from '$lib/models/diagrams';
import type { NoteActionIdentities } from '$lib/services/notes/action-identities';
export interface SelectionSubmissionStorage {
	read(accountId: string, action: SelectionAction): readonly SelectionSubmission[];
	write(accountId: string, action: SelectionAction, requests: readonly SelectionSubmission[]): void;
}
export interface DiagramSubmissionStorage {
	read(accountId: string): readonly DiagramActionSubmission[];
	write(accountId: string, requests: readonly DiagramActionSubmission[]): void;
	candidate(input: DiagramActionInput, requestId: string): DiagramActionSubmission;
}
export interface NoteSubmissionRemote {
	selection(action: SelectionAction, request: SelectionSubmission): Promise<AgentRunReceipt>;
	diagram(request: DiagramActionSubmission): Promise<AgentRunReceipt>;
}
export interface NoteSubmissionIdentity {
	create(): string;
}
/** A started agent run, or why the request was not accepted. */
export type NoteSubmission =
	| { readonly kind: 'started'; readonly receipt: AgentRunReceipt }
	| { readonly kind: 'failure'; readonly message: string };
export interface NoteSubmissionController {
	selection(
		accountId: string,
		action: SelectionAction,
		input: TextSelection
	): Promise<NoteSubmission>;
	diagram(accountId: string, input: DiagramActionInput): Promise<NoteSubmission>;
}
/** Persist before sending; only a returned durable receipt releases an uncertain identity. */
export class NoteSubmissions implements NoteSubmissionController {
	constructor(
		private readonly selections: SelectionSubmissionStorage,
		private readonly diagrams: DiagramSubmissionStorage,
		private readonly identities: NoteActionIdentities,
		private readonly remote: NoteSubmissionRemote,
		private readonly identity: NoteSubmissionIdentity
	) {}
	private async started(send: () => Promise<AgentRunReceipt>): Promise<NoteSubmission> {
		try {
			return { kind: 'started', receipt: await send() };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'The request failed.'
			};
		}
	}
	selection(
		accountId: string,
		action: SelectionAction,
		input: TextSelection
	): Promise<NoteSubmission> {
		return this.started(() => this.sendSelection(accountId, action, input));
	}
	diagram(accountId: string, input: DiagramActionInput): Promise<NoteSubmission> {
		return this.started(() => this.sendDiagram(accountId, input));
	}
	private async sendSelection(
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
	private async sendDiagram(
		accountId: string,
		input: DiagramActionInput
	): Promise<AgentRunReceipt> {
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
}
