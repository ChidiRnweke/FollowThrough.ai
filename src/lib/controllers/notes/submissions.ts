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
export interface NoteSubmissionController {
	selection(
		accountId: string,
		action: SelectionAction,
		input: TextSelection
	): Promise<AgentRunReceipt>;
	diagram(accountId: string, input: DiagramActionInput): Promise<AgentRunReceipt>;
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
	async selection(
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
	async diagram(accountId: string, input: DiagramActionInput): Promise<AgentRunReceipt> {
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
