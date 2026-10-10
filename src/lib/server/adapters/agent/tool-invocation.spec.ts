import { ToolLifecycleError, ValidationError } from '$lib/errors';
import type { ToolPreparation } from '$lib/models/agent-tool-protocol';
import { ToolCallBoundary } from '$lib/server/adapters/agent/tool-call';
import { AgentToolInvocation } from '$lib/server/adapters/agent/tool-invocation';
import { AgentToolCalls } from '$lib/server/adapters/agent/tool-invocation-errors';
import { AgentToolInvocationStore } from '$lib/server/stores/agent/tool-invocation';
import { expect, it } from 'vitest';

const setup = (revision: () => number, gate: Promise<void> = Promise.resolve()) => {
	const abort = new AbortController();
	const invocation = new AgentToolInvocation(
		new AgentToolInvocationStore(),
		new AgentToolCalls(new ToolCallBoundary()),
		async (input) => {
			const reviewedRevision = revision();
			await gate;
			return {
				kind: 'approval_required',
				action: {
					arguments: { input, reviewedRevision },
					execute: async () => ({ reviewedRevision })
				}
			};
		},
		abort.signal
	);
	return { invocation, abort };
};
const execute = async (invocation: AgentToolInvocation, preparation: Promise<ToolPreparation>) => {
	const prepared = await preparation;
	if (prepared.kind === 'failure') throw new Error('Expected a prepared action');
	return invocation.execute(prepared.action);
};

it('executes the reviewed preparation after the source revision changes', async () => {
	let revision = 1;
	const { invocation } = setup(() => revision);
	await invocation.prepare({ text: 'Save' }, 'call-1', 'approval');
	revision = 2;
	expect(
		await execute(invocation, invocation.prepare({ text: 'Save' }, 'call-1', 'execute'))
	).toEqual({ reviewedRevision: 1 });
});

it('shares an outstanding preparation between approval and execution', async () => {
	let revision = 1;
	const gate = Promise.withResolvers<void>();
	const { invocation } = setup(() => revision, gate.promise);
	const approval = invocation.prepare({ text: 'Save' }, 'call-1', 'approval');
	revision = 2;
	const execution = invocation.prepare({ text: 'Save' }, 'call-1', 'execute');
	gate.resolve();
	expect(
		await Promise.all([execute(invocation, approval), execute(invocation, execution)])
	).toEqual([{ reviewedRevision: 1 }, { reviewedRevision: 1 }]);
});

it('rejects a reused call identity with changed arguments', async () => {
	const { invocation } = setup(() => 1);
	await invocation.prepare({ text: 'Reviewed' }, 'call-1', 'approval');
	expect(() => invocation.prepare({ text: 'Changed' }, 'call-1', 'execute')).toThrow(
		ToolLifecycleError
	);
});

it('keeps the same call identity isolated between executions', async () => {
	const first = setup(() => 1).invocation;
	await first.prepare({ text: 'Save' }, 'call-1', 'approval');
	const second = setup(() => 2).invocation;
	expect(await execute(second, second.prepare({ text: 'Save' }, 'call-1', 'execute'))).toEqual({
		reviewedRevision: 2
	});
});

it('preserves cancellation when preparation later reports a validation failure', async () => {
	const abort = new AbortController();
	const reason = new Error('Cancelled');
	const gate = Promise.withResolvers<void>();
	const invocation = new AgentToolInvocation(
		new AgentToolInvocationStore(),
		new AgentToolCalls(new ToolCallBoundary()),
		async () => {
			await gate.promise;
			throw new ValidationError('No longer valid');
		},
		abort.signal
	);
	const result = invocation.prepare({}, 'call-1', 'approval');
	abort.abort(reason);
	gate.resolve();
	await expect(result).rejects.toBe(reason);
});
