import type { AgentRunId, AgentRunReceipt } from '$lib/models/agent';
import type { SelectionAction, SelectionSubmission } from '$lib/models/notes';
import type { DiagramActionSubmission } from '$lib/models/diagrams';
import type { NoteSubmissionRemote } from '$lib/models/browser-workspace';
import { testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
export class InMemoryNoteSubmissionRemote implements NoteSubmissionRemote {
	readonly selections: { action: SelectionAction; request: SelectionSubmission }[] = [];
	readonly diagrams: DiagramActionSubmission[] = [];
	private gate: { started(): void; ready: Promise<void> } | null = null;
	pause() {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	private async settle(receipt: AgentRunReceipt) {
		const gate = this.gate;
		const failure = this.failure;
		this.gate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (failure) throw failure;
		return receipt;
	}
	failure: Error | null = new Error('The receipt was lost');
	readonly receipt: AgentRunReceipt = {
		runId: '00000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: testConversationId(),
		status: 'queued',
		latestCursor: '1'
	};
	readonly receipts: AgentRunReceipt[] = [];
	private readonly receiptsByRequest = new Map<string, AgentRunReceipt>();
	private receiptFor(requestId: string): AgentRunReceipt {
		let receipt = this.receiptsByRequest.get(requestId);
		if (!receipt) {
			receipt =
				this.receiptsByRequest.size === 0
					? this.receipt
					: {
							...this.receipt,
							runId: crypto.randomUUID() as AgentRunId,
							conversationId: testConversationId(this.receiptsByRequest.size + 1)
						};
			this.receiptsByRequest.set(requestId, receipt);
		}
		this.receipts.push(receipt);
		return receipt;
	}
	async selection(action: SelectionAction, request: SelectionSubmission) {
		this.selections.push({ action, request });
		return this.settle(this.receiptFor(request.requestId));
	}
	async diagram(request: DiagramActionSubmission) {
		this.diagrams.push(request);
		return this.settle(this.receiptFor(request.requestId));
	}
}
