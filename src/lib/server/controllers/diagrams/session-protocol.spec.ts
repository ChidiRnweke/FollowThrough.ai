import { describe, expect, it } from 'vitest';
import { DiagramSessions } from './generation';
import { AgentSdkDiagramProvider } from '$lib/server/adapters/diagrams/generation';
import { DiagramGenerationStore } from '$lib/server/stores/diagrams/generation';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryDiagramModel } from '$lib/testing/diagrams/fakes/in-memory-diagram-model';
import type { DiagramGenerationRequest, DiagramSubmission } from '$lib/models/diagrams/generation';

const request: DiagramGenerationRequest = {
	model: 'test/model',
	operation: 'generate',
	prompt: 'Draw a queue',
	instructions: 'Submit a Mermaid diagram.'
};
const draft: DiagramSubmission = { kind: 'mermaid', source: 'flowchart LR\nA --> B' };
const setup = (candidates = [draft]) => {
	const provider = new InMemoryModelProvider(new InMemoryDiagramModel(candidates));
	const session = new DiagramSessions(
		new AgentSdkDiagramProvider(provider),
		new DiagramGenerationStore()
	);
	session.start(request);
	return { provider, session };
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
});

it('reports a provider failure and releases its lease', async () => {
	const { session, provider } = setup([]);
	const outcome = await session.result().then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({ outcome, closed: provider.closed }).toEqual({
		outcome: 'No diagram candidates remain.',
		closed: true
	});
});

it('cancels one pending submission without closing another generation', async () => {
	const left = setup();
	const right = setup();
	try {
		for await (const event of left.session.events) {
			if (event.kind === 'submission') break;
		}
		await left.session.close();
		for await (const event of right.session.events) {
			if (event.kind === 'submission')
				right.session.respond(event.id, { kind: 'accepted', draft: event.draft });
		}
		expect({
			cancelledLeaseClosed: left.provider.closed,
			result: await right.session.result(),
			completedLeaseClosed: right.provider.closed
		}).toEqual({ cancelledLeaseClosed: true, result: draft, completedLeaseClosed: true });
	} finally {
		await Promise.all([left.session.close(), right.session.close()]);
	}
});
