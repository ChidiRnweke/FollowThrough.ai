import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import type { AgentEvent, AgentRun, AgentRunId } from '$lib/models/agent';
import type { ConnectorId } from '$lib/models/connectors';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createConnectorTools } from '$lib/server/factories/agent/tools/connectors';
import { AgentTurnService } from '$lib/server/services/agent/runs/turns';
import { ConnectorToolPolicyRules } from '$lib/services/connectors/policy';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryToolSequenceModel } from '$lib/testing/agent/fakes/in-memory-tool-calling-model';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { connectorsFixture, writeTool } from '$lib/testing/connectors/fixtures/connectors';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';

interface Call {
	readonly name: string;
	readonly callId: string;
	readonly arguments: Readonly<Record<string, string>>;
}

const search = (query: string): Call => ({
	name: 'search_tools',
	callId: 'call-search',
	arguments: { query }
});

const createIssue = (args: Readonly<Record<string, string>>): Call => ({
	name: 'linear__create_issue',
	callId: 'call-issue',
	arguments: args
});

const SETTLED: readonly AgentRun['status'][] = ['completed', 'failed', 'cancelled'];

/** Linear, signed in through its authorization server, behind a harness whose model makes `calls`. */
const scenario = async (calls: readonly Call[]) => {
	const connectors = connectorsFixture();
	const start = await connectors.controller.connect({ kind: 'catalog', catalogId: 'linear' });
	if (start.kind !== 'authorize') throw new Error('Linear signs in with OAuth');
	const approval = connectors.authorizationServer.approve(start.authorizationUrl);
	const connectorId: ConnectorId = await connectors.controller.completeAuthorization({
		state: approval.state,
		issuer: approval.iss,
		outcome: { kind: 'code', code: approval.code }
	});
	const model = new InMemoryToolSequenceModel(
		calls.map((call) => ({ ...call, arguments: JSON.stringify(call.arguments) }))
	);
	const controllers = capabilityDependencies<ControllerFactory>({
		connectors: () => connectors.controller
	});
	const context = agentContextFixture({
		turns: new AgentTurnService({
			models: () => new InMemoryModelProvider(model),
			images: capabilityDependencies<Pick<OpenAI, 'chat'>>({})
		}),
		// Queries embed with the model the connector snapshot was embedded with.
		toolSearch: new InMemoryToolRetriever(connectors.embeddings.model),
		connectorTools: (builds) => createConnectorTools(controllers, builds),
		connectors: {
			kind: 'on',
			source: connectors.directory,
			policy: new ConnectorToolPolicyRules()
		}
	});
	const run = async (mode: AgentRun['executionMode'] = 'approval_required') => {
		await context.builder.build(
			testActor(),
			{ conversationId: crypto.randomUUID() as never, prompt: 'File the issue' },
			{ provenanceId: testProvenanceId() },
			[],
			new AbortController().signal,
			mode
		);
		return context.runs.runs.at(-1)!;
	};
	const events = (runId: AgentRunId): AgentEvent[] =>
		context.runs.events.filter((record) => record.runId === runId).map((record) => record.event);
	const outcome = (runId: AgentRunId, callId: string) =>
		events(runId).find(
			(event) =>
				(event.type === 'tool_succeeded' || event.type === 'tool_reported_failure') &&
				event.callId === callId
		);
	/** Approves every parked call, as the chat does, and waits for the resumed run to settle. */
	const approve = async (parked: AgentRun) => {
		await context.controller.decideMany({
			runId: parked.id,
			callIds: parked.pendingDecisions.map((decision) => decision.callId),
			decision: 'approve'
		});
		for (let attempt = 0; attempt < 300; attempt++) {
			const current = await context.runs.findAgentById(parked.id);
			if (current && SETTLED.includes(current.status)) return current;
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		throw new Error('The resumed run never settled');
	};
	const tool = async (serverName: string) => {
		const found = (await connectors.controller.get(connectorId)).tools.find(
			(entry) => entry.serverName === serverName
		);
		if (!found) throw new Error(`Linear has no ${serverName} tool`);
		return found;
	};
	return { connectors, connectorId, run, events, outcome, approve, tool };
};

describe('connector tools in an agent run', () => {
	it('finds a read-only connector tool with search_tools and runs it without asking', async () => {
		const { connectors, run, outcome } = await scenario([
			search('list linear issues'),
			{ name: 'linear__list_issues', callId: 'call-list', arguments: { query: 'open' } }
		]);
		const finished = await run();
		expect({
			status: finished.status,
			received: connectors.linear.received,
			settled: outcome(finished.id, 'call-list')
		}).toMatchObject({
			status: 'completed',
			received: [{ name: 'list_issues', arguments: { query: 'open' } }],
			settled: {
				type: 'tool_succeeded',
				source: 'connector',
				name: 'linear__list_issues',
				output: {
					kind: 'connector_result',
					connector: 'Linear',
					content: [{ type: 'text', text: 'list_issues ran' }]
				}
			}
		});
	});

	it('parks a write until the user approves it, then sends exactly the approved arguments', async () => {
		const { connectors, run, approve, tool } = await scenario([
			search('create a linear issue'),
			createIssue({ title: 'Ship connectors' })
		]);
		const parked = await run();
		const sentBeforeApproval = [...connectors.linear.received];
		const resumed = await approve(parked);
		expect({
			status: parked.status,
			decisions: parked.pendingDecisions,
			sentBeforeApproval,
			resumed: resumed.status,
			received: connectors.linear.received
		}).toEqual({
			status: 'awaiting_approval',
			decisions: [
				{
					source: 'connector',
					callId: 'call-issue',
					toolName: 'linear__create_issue',
					checksum: (await tool('create_issue')).checksum,
					arguments: { title: 'Ship connectors' }
				}
			],
			sentBeforeApproval: [],
			resumed: 'completed',
			received: [{ name: 'create_issue', arguments: { title: 'Ship connectors' } }]
		});
	});

	it('runs a write at once in auto-accept mode', async () => {
		const { connectors, run } = await scenario([
			search('create a linear issue'),
			createIssue({ title: 'Ship connectors' })
		]);
		const finished = await run('auto_accept');
		expect({ status: finished.status, received: connectors.linear.received }).toEqual({
			status: 'completed',
			received: [{ name: 'create_issue', arguments: { title: 'Ship connectors' } }]
		});
	});

	it('does not offer a tool the user turned off', async () => {
		const { connectors, connectorId, run, events } = await scenario([
			search('create a linear issue'),
			createIssue({ title: 'Ship connectors' })
		]);
		await connectors.controller.setToolPolicy({
			connectorId,
			serverName: 'create_issue',
			policy: 'off'
		});
		const finished = await run('auto_accept');
		expect({
			received: connectors.linear.received,
			settled: events(finished.id).find(
				(event) => event.type === 'tool_failed' && event.callId === 'call-issue'
			)
		}).toMatchObject({
			received: [],
			settled: { name: 'linear__create_issue', failure: expect.stringContaining('not available') }
		});
	});

	it('runs nothing when the approved tool changed before the run resumed', async () => {
		const { connectors, connectorId, run, approve, outcome } = await scenario([
			search('create a linear issue'),
			createIssue({ title: 'Ship connectors' })
		]);
		const parked = await run();
		connectors.linear.tools = [
			{
				...writeTool('create_issue'),
				description: 'Creates an issue and assigns it to everyone.'
			}
		];
		await connectors.controller.refreshTools(connectorId);
		const resumed = await approve(parked);
		expect({
			status: resumed.status,
			received: connectors.linear.received,
			settled: outcome(parked.id, 'call-issue')
		}).toMatchObject({
			status: 'completed',
			received: [],
			settled: {
				type: 'tool_reported_failure',
				failure: 'This tool changed after you approved the call, so nothing ran.'
			}
		});
	});

	it('answers arguments that break the server schema without asking or sending them', async () => {
		const { connectors, run, outcome } = await scenario([
			search('create a linear issue'),
			createIssue({ summary: 'no title' })
		]);
		const finished = await run();
		expect({
			status: finished.status,
			received: connectors.linear.received,
			settled: outcome(finished.id, 'call-issue')
		}).toMatchObject({
			status: 'completed',
			received: [],
			settled: { type: 'tool_reported_failure', output: { code: 'VALIDATION' } }
		});
	});
});

describe('a connector tool result too large to read inline', () => {
	it('reaches the model as an agent file the model can read back', async () => {
		const { connectors, run, outcome } = await scenario([
			search('list linear issues'),
			{ name: 'linear__list_issues', callId: 'call-list', arguments: { query: 'all' } }
		]);
		const issue = (index: number) =>
			`ENG-${index}: Investigate the flaky sync test on runner ${index}.`;
		connectors.linear.respond = () => ({
			content: [
				{ type: 'text', text: Array.from({ length: 2000 }, (_, index) => issue(index)).join('\n') }
			]
		});
		const finished = await run();
		const settled = outcome(finished.id, 'call-list');
		const text =
			settled?.type === 'tool_succeeded' ? JSON.stringify(settled.output) : JSON.stringify(settled);
		expect({
			stored: /\[content stored at \/conversations\/[^/]+\/tool-results\/call-list\//.test(text),
			inline: text.includes(issue(1999))
		}).toEqual({ stored: true, inline: false });
	});
});
