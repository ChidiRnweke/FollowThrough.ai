import type { AgentRunContext, PendingAgentDecision, PreparedAgentRun } from '$lib/models/agent';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { AgentSdkInfrastructure } from '$lib/server/adapters/agent/execution-infrastructure';
import { AgentExecution } from '$lib/server/controllers/agent/execution';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { getGlobalTraceProvider, setTraceProcessors, tool } from '@openai/agents';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
const timestamp = '2026-01-01T00:00:00.000Z' as DateTime;
const resolvedContext: AgentRunContext = {
	contextNotes: [],
	contextResources: [],
	skills: { items: [] }
};
const run: PreparedAgentRun = {
	kind: 'agent',
	id: '00000000-0000-4000-8000-000000000098' as never,
	userId: testActor().userId,
	conversationId: '00000000-0000-4000-8000-000000000099' as never,
	model: 'local/test',
	executionMode: 'approval_required',
	status: 'running',
	requestId: 'request-provider-test',
	pendingDecisions: [],
	contextSnapshot: resolvedContext,
	inputSnapshot: {
		conversationId: '00000000-0000-4000-8000-000000000099' as never,
		prompt: 'Help'
	},
	createdAt: timestamp,
	updatedAt: timestamp
};
it('fails clearly when no API key is configured', async () => {
	const runner = new AgentExecution(
		new AgentPromptService(),
		new AgentToolRecoveryService(),
		createAgentStream,
		async () => {
			throw new Error('Disabled execution must not construct tools');
		},
		{
			create: () => {
				throw new Error('Unexpected conversation session creation');
			}
		},
		false,
		new AgentSdkInfrastructure('', undefined, undefined, undefined, undefined),
		undefined
	);
	const updates = runner.execute({
		actor: testActor(),
		run,
		imageInput: { kind: 'none' },
		webSearch: CHAT_WEB_SEARCH_DEFAULTS,
		request: { conversationId: run.conversationId, prompt: 'Help' },
		context: run.contextSnapshot!,
		signal: new AbortController().signal,
		toolExecutor: { execute: async (_input, action) => action() }
	});
	await expect(updates[Symbol.asyncIterator]().next()).rejects.toThrow('OPENROUTER_API_KEY');
});
describe('Agent turn span lifecycle', () => {
	const encoder = new TextEncoder();
	const chunk = (delta: unknown, finishReason: string | null = null) =>
		`data: ${JSON.stringify({
			id: 'chatcmpl-test',
			object: 'chat.completion.chunk',
			created: 0,
			model: 'local/test',
			choices: [{ index: 0, delta, finish_reason: finishReason }]
		})}\n\n`;

	class ApprovalFetch {
		readonly fetch = async (): Promise<Response> => {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(chunk({ role: 'assistant', content: null })));
					controller.enqueue(
						encoder.encode(
							chunk({
								tool_calls: [
									{
										index: 0,
										id: 'call-approval',
										type: 'function',
										function: { name: 'save_note', arguments: '{"noteId":"n"}' }
									}
								]
							})
						)
					);
					controller.enqueue(encoder.encode(chunk({}, 'tool_calls')));
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				}
			});
			return new Response(body, {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			});
		};
	}

	const approvalTool = tool({
		name: 'save_note',
		description: 'Save a note',
		parameters: z.object({ conversationId: z.string(), noteId: z.string() }),
		needsApproval: true,
		execute: async () => ({ ok: true })
	});

	const bufferedSession = {
		getSessionId: async () => 'session-test',
		getItems: async () => [],
		addItems: async () => undefined,
		popItem: async () => undefined,
		clearSession: async () => undefined,
		applyHistoryMutations: async () => undefined,
		snapshot: async () => []
	};

	const reasoning = new AgentExecution(
		new AgentPromptService(),
		new AgentToolRecoveryService(),
		createAgentStream,
		async () => ({
			agentTools: () => [approvalTool],
			offeredToolNames: () => [],
			reviewDecision: (pending: PendingAgentDecision) => pending,
			catalog: () => []
		}),
		{ create: () => bufferedSession },
		true,
		new AgentSdkInfrastructure(
			'test-key',
			'https://openrouter.test/api/v1',
			'http://localhost:5173',
			new ApprovalFetch().fetch,
			undefined
		),
		undefined
	);

	it('ends the SDK agent span when the run parks on an approval', async () => {
		// The SDK disables tracing under NODE_ENV=test; re-enable so the recording
		// processor observes the SDK span lifecycle.
		getGlobalTraceProvider().setDisabled(false);
		const ended: string[] = [];
		const processor = {
			async onTraceStart() {},
			async onTraceEnd() {},
			async onSpanStart() {},
			async onSpanEnd(span: { spanData?: { type?: string } }) {
				ended.push(String(span.spanData?.type));
			},
			async shutdown() {},
			async forceFlush() {}
		};
		setTraceProcessors([processor]);
		try {
			const updates = reasoning.execute({
				actor: testActor(),
				run,
				imageInput: { kind: 'none' },
				webSearch: CHAT_WEB_SEARCH_DEFAULTS,
				request: { conversationId: run.conversationId, prompt: 'Save this note' },
				context: run.contextSnapshot!,
				signal: new AbortController().signal,
				toolExecutor: { execute: async (_input, action) => action() }
			});
			for await (const update of updates) {
				if (update.type === 'approval_checkpoint') break;
			}
		} finally {
			setTraceProcessors([]);
		}
		expect(ended).toContain('agent');
	});

	// The call a run parks on is in neither the transcript nor the session — the SDK
	// drops approval items before persisting — so without the run's own pending
	// decisions the tool deserializes as gated-off and `RunState.fromString` throws
	// `Tool <name> not found`. Every approval of a long-tail mutation failed this way.
	it('promotes the tool a parked run is about to answer for', async () => {
		const promotions: string[][] = [];
		const recording = new AgentExecution(
			new AgentPromptService(),
			new AgentToolRecoveryService(),
			createAgentStream,
			async () => ({
				agentTools: (alreadyPromoted: readonly string[] = []) => {
					promotions.push([...alreadyPromoted]);
					return [approvalTool];
				},
				offeredToolNames: () => [],
				reviewDecision: (pending: PendingAgentDecision) => pending,
				catalog: () => [{ name: 'save_note' }]
			}),
			{ create: () => bufferedSession },
			true,
			new AgentSdkInfrastructure(
				'test-key',
				'https://openrouter.test/api/v1',
				'http://localhost:5173',
				new ApprovalFetch().fetch,
				undefined
			),
			undefined
		);
		const parked: PreparedAgentRun = {
			...run,
			pendingDecisions: [{ callId: 'call-approval', toolName: 'save_note', arguments: {} }]
		};
		const updates = recording.execute({
			actor: testActor(),
			run: parked,
			imageInput: { kind: 'none' },
			webSearch: CHAT_WEB_SEARCH_DEFAULTS,
			request: { conversationId: run.conversationId, prompt: 'Save this note' },
			context: parked.contextSnapshot!,
			signal: new AbortController().signal,
			toolExecutor: { execute: async (_input, action) => action() }
		});
		for await (const update of updates) {
			if (update.type === 'approval_checkpoint') break;
		}
		expect(promotions[0]).toContain('save_note');
	});
});
