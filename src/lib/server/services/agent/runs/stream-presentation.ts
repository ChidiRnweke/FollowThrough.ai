import { AgentProviderFailure } from '$lib/errors';
import type { ProviderToolCall } from '$lib/models/agent';
import type { OutputSegment, StoredAgentRunEventRecord } from '$lib/models/agent';
import type { AgentEvent, AgentToolOutcome, ProviderStreamEvent } from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
export interface AgentStreamPresentation {
	start(call: ProviderToolCall): ProviderToolCall & { readonly callId: string };
	/** A call the SDK opened, as a running row; absent when it never runs (see {@link settled}). */
	started(
		call: ProviderToolCall & { readonly callId: string },
		name: AgentToolName | undefined
	): AgentEvent | undefined;
	completed(call: ProviderToolCall, active: ReadonlyMap<string, ProviderToolCall>): CompletedCall;

	segments(records: readonly StoredAgentRunEventRecord[]): readonly OutputSegment[];
	/** How a finished call settles in the journal. */
	settled(
		call: CompletedCall,
		name: AgentToolName | undefined,
		output: AgentToolOutcome
	): AgentEvent;
	reasoning(
		event: ProviderStreamEvent,
		streamed: boolean
	): { readonly event?: AgentEvent; readonly streamed: boolean };
}
/** A call whose output arrived, matched to the call the SDK opened for it. */
export interface CompletedCall {
	readonly callId?: string;
	/** The name the model asked for, which need not be a tool this agent offers. */
	readonly name: string;
	/** Whether the call's arguments could be read; the SDK answers unreadable ones itself. */
	readonly readable: boolean;
}

/**
 * The mapper records what the SDK did; it does not decide again.
 *
 * Two calls never run, and the SDK answers both itself so the run continues: a name the agent
 * does not have (`TOOL_NOT_AVAILABLE`, with suggestions), and arguments that are not JSON (a
 * plain-text correction). Neither gets a running row — `tool_started` names a catalog tool with
 * readable arguments — and both settle as `tool_failed` in the journal. The turn summary then
 * decides what is news: a failure a later call put right is not reported.
 */
export class AgentStreamPresentationService implements AgentStreamPresentation {
	start(call: ProviderToolCall): ProviderToolCall & { readonly callId: string } {
		if (call.callId === undefined)
			throw new AgentProviderFailure(
				`The provider opened a call to "${call.name}" without an identifier`,
				'UNIDENTIFIED_TOOL_CALL',
				false
			);
		return { ...call, callId: call.callId };
	}
	started(
		call: ProviderToolCall & { readonly callId: string },
		name: AgentToolName | undefined
	): AgentEvent | undefined {
		return name !== undefined && call.arguments.kind === 'value'
			? { type: 'tool_started', callId: call.callId, name, arguments: call.arguments.value }
			: undefined;
	}

	completed(call: ProviderToolCall, active: ReadonlyMap<string, ProviderToolCall>): CompletedCall {
		const soleActive = active.size === 1 ? active.keys().next().value : undefined;
		const callId = call.callId ?? soleActive;
		const known = callId === undefined ? undefined : active.get(callId);
		return {
			...(callId === undefined ? {} : { callId }),
			name: known?.name ?? call.name,
			readable: known === undefined || known.arguments.kind === 'value'
		};
	}

	settled(
		call: CompletedCall,
		name: AgentToolName | undefined,
		output: AgentToolOutcome
	): AgentEvent {
		const id = call.callId === undefined ? {} : { callId: call.callId };
		if (name === undefined)
			return {
				type: 'tool_failed',
				...id,
				name: call.name,
				// The SDK's own answer to a call it could not route, or a plain statement of it.
				failure:
					output.kind === 'reported_failure'
						? output.failure
						: 'The agent has no tool by this name, so nothing ran.'
			};
		if (!call.readable)
			return {
				type: 'tool_failed',
				...id,
				name,
				failure: 'The tool arguments were not valid JSON, so the tool did not run.'
			};
		const identity = { ...id, name };
		switch (output.kind) {
			case 'none':
				return { type: 'tool_succeeded', ...identity };
			case 'corrupt':
				return {
					type: 'tool_failed',
					...identity,
					failure: `The tool result could not be read. ${output.message}`
				};
			case 'unreadable_failure':
				return {
					type: 'tool_failed',
					...identity,
					failure: `The tool reported a failure that could not be read. ${output.message}`
				};
			case 'succeeded':
				return { type: 'tool_succeeded', ...identity, output: output.value };
			case 'reported_failure':
				return {
					type: 'tool_reported_failure',
					...identity,
					output: output.value,
					failure: output.failure
				};
		}
	}
	reasoning(
		event: ProviderStreamEvent,
		streamed: boolean
	): { readonly event?: AgentEvent; readonly streamed: boolean } {
		if (event.type === 'reasoning_delta')
			return { event: { type: 'reasoning_delta', text: event.text }, streamed: true };
		if (event.type !== 'reasoning_item') return { streamed };
		return streamed
			? { streamed: false }
			: { event: { type: 'reasoning_delta', text: event.text }, streamed: false };
	}
	/** Reconstruct contiguous text and reasoning without merging across intervening activity. */
	segments(records: readonly StoredAgentRunEventRecord[]): readonly OutputSegment[] {
		const segments: { kind: 'text' | 'reasoning'; text: string; cursor: string }[] = [];
		// `open` is what makes this faithful rather than merely grouped: anything else in the
		// stream — a tool call above all — closes the current run. Merged across a call, a
		// sentence spoken after the work would carry the cursor from before it and be replayed
		// ahead of the work it describes.
		let open: (typeof segments)[number] | undefined;
		for (const record of records) {
			// An unreadable row closes the open segment rather than being skipped. It is
			// something that happened between two runs of output, and merging across it
			// would give the second run the first one's cursor.
			if (record.kind === 'unreadable') {
				open = undefined;
				continue;
			}
			const { cursor, event: readable } = record;
			if (readable.type !== 'text_delta' && readable.type !== 'reasoning_delta') {
				open = undefined;
				continue;
			}
			const kind = readable.type === 'text_delta' ? 'text' : 'reasoning';
			if (open?.kind === kind) open.text += readable.text;
			else {
				open = { kind, text: readable.text, cursor };
				segments.push(open);
			}
		}
		return segments.filter((segment) => segment.text.length > 0);
	}
}
