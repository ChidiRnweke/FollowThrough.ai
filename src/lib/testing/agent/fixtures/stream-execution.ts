import type { AgentEvent, ConversationId, ProviderStreamEvent } from '$lib/models/agent';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';

/** The run lifecycle events the harness records around a turn's own events. */
const LIFECYCLE: ReadonlySet<AgentEvent['type']> = new Set([
	'run_queued',
	'run_started',
	'completed',
	'failed',
	'cancelled',
	'resources_stale'
]);

/** Runs complete agent runs whose provider streams `events`, and reads back what each recorded. */
export const streamExecutionFixture = (events: readonly ProviderStreamEvent[]) => {
	const fixture = agentContextFixture();
	fixture.turns.events = [...events];
	const collect = async (): Promise<AgentEvent[]> => {
		const before = new Set(fixture.runs.runs.map((run) => run.id));
		const recorded = () => {
			const run = fixture.runs.runs.find((candidate) => !before.has(candidate.id));
			return fixture.runs.events
				.filter((record) => record.runId === run?.id)
				.map((record) => record.event)
				.filter((event) => !LIFECYCLE.has(event.type));
		};
		await fixture.builder.build(
			testActor(),
			{ conversationId: crypto.randomUUID() as ConversationId, prompt: 'Help' },
			{ provenanceId: testProvenanceId() }
		);
		return recorded();
	};
	return { collect, turns: fixture.turns };
};
