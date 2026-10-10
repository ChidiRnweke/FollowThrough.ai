import { describe, expect, it } from 'vitest';
import { DiagramProviderSession } from './generation';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import {
	InMemoryDiagramModel,
	type DiagramCandidate
} from '$lib/testing/diagrams/fakes/in-memory-diagram-model';
import { AgentToolEventMapper } from '$lib/server/services/agent/runs/reasoning';
import type { AgentEvent } from '$lib/models/agent';
import type { DiagramGenerationRequest, DiagramSubmission } from '$lib/models/diagrams/generation';

const request: DiagramGenerationRequest = {
	model: 'test/model',
	operation: 'generate',
	prompt: 'Draw a queue',
	instructions: 'Submit a Mermaid diagram.'
};
const draft: DiagramSubmission = { kind: 'mermaid', source: 'flowchart LR\nA --> B' };
const setup = (candidates: readonly DiagramCandidate[] = [draft]) => {
	const provider = new InMemoryModelProvider(new InMemoryDiagramModel(candidates));
	return { provider, session: new DiagramProviderSession(provider, request) };
};

describe('Diagram provider submission protocol', () => {
	it('returns the draft accepted by the controller', async () => {
		const { session } = setup();
		try {
			for await (const event of session.events) {
				if (event.kind === 'submission')
					session.respond(event.id, { kind: 'accepted', draft: event.draft });
			}
			expect(await session.result()).toEqual(draft);
		} finally {
			await session.close();
		}
	});

	it('allows another provider turn after the controller rejects a submission', async () => {
		const { session } = setup([{ kind: 'mermaid', source: 'invalid' }, draft]);
		try {
			for await (const event of session.events) {
				if (event.kind === 'submission')
					session.respond(
						event.id,
						event.draft.source === 'invalid'
							? { kind: 'rejected', message: 'Invalid Mermaid syntax' }
							: { kind: 'accepted', draft: event.draft }
					);
			}
			expect(await session.result()).toEqual(draft);
		} finally {
			await session.close();
		}
	});

	it('releases the provider when closed while a submission awaits validation', async () => {
		const { session, provider } = setup();
		try {
			for await (const event of session.events) {
				if (event.kind === 'submission') break;
			}
			await session.close();
			expect(provider.closed).toBe(true);
		} finally {
			await session.close();
		}
	});

	/**
	 * The submission tool shares the chat tools' failure envelope, so each
	 * correctable mistake reaches the model as feedback and is recorded as failed,
	 * and the run goes on to the valid draft.
	 */
	it('records every correctable submission as failed and accepts the corrected draft', async () => {
		const { session } = setup([
			{ kind: 'raw', format: 'mermaid', arguments: '{"source": "flowchart' },
			{ kind: 'raw', format: 'mermaid', arguments: '{"source": ""}' },
			{ kind: 'mermaid', source: 'invalid' },
			draft
		]);
		const mapper = new AgentToolEventMapper();
		const outcomes: AgentEvent['type'][] = [];
		try {
			for await (const event of session.events) {
				if (event.kind === 'submission') {
					session.respond(
						event.id,
						event.draft.source === 'invalid'
							? { kind: 'rejected', message: 'Invalid Mermaid syntax' }
							: { kind: 'accepted', draft: event.draft }
					);
					continue;
				}
				const mapped = mapper.map(event.event);
				if (mapped && mapped.type !== 'tool_started') outcomes.push(mapped.type);
			}
			expect({ draft: await session.result(), outcomes }).toEqual({
				draft,
				outcomes: [
					'tool_failed',
					'tool_reported_failure',
					'tool_reported_failure',
					'tool_succeeded'
				]
			});
		} finally {
			await session.close();
		}
	});
});
