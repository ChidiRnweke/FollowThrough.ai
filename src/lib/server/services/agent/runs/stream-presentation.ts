import { AgentProviderFailure } from '$lib/errors';
import type { ProviderToolCall } from '$lib/models/agent';
import type { OutputSegment, StoredAgentRunEventRecord } from '$lib/models/agent';
import type { AgentEvent, AgentToolOutcome, ProviderStreamEvent } from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
export interface AgentStreamPresentation {
	start(call: ProviderToolCall): ProviderToolCall & { readonly callId: string };
	completed(
		call: ProviderToolCall,
		active: ReadonlyMap<string, ProviderToolCall>
	): { readonly callId?: string; readonly name: string };

	segments(records: readonly StoredAgentRunEventRecord[]): readonly OutputSegment[];
	outcome(
		identity: { readonly callId?: string; readonly name: AgentToolName },
		output: AgentToolOutcome
	): AgentEvent;
	reasoning(
		event: ProviderStreamEvent,
		streamed: boolean
	): { readonly event?: AgentEvent; readonly streamed: boolean };
}
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
	completed(
		call: ProviderToolCall,
		active: ReadonlyMap<string, ProviderToolCall>
	): { readonly callId?: string; readonly name: string } {
		const soleActive = active.size === 1 ? active.keys().next().value : undefined;
		const callId = call.callId ?? soleActive;
		const known = callId === undefined ? undefined : active.get(callId);
		return { ...(callId === undefined ? {} : { callId }), name: known?.name ?? call.name };
	}

	outcome(
		identity: { readonly callId?: string; readonly name: AgentToolName },
		output: AgentToolOutcome
	): AgentEvent {
		switch (output.kind) {
			case 'none':
				return { type: 'tool_succeeded', ...identity };
			case 'corrupt':
				return {
					type: 'tool_failed',
					...identity,
					failure: `The tool result could not be read. ${output.message}`
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
