import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { AgentRunId, AgentRunStatus } from '$lib/models/agent';
import { createLab, type Lab } from './application';

/**
 * Canary for the eval harness itself: boots the lab and drives one run through
 * the instrumented production controllers, then stops it before the provider
 * call can cost anything. A harness-level break — like the controller
 * instrumentation that turned synchronous helpers into promises and made every
 * submit throw — fails here in seconds instead of surfacing as a wall of opaque
 * case failures after a full model sweep.
 */
describe('eval lab smoke', () => {
	const TERMINAL: readonly AgentRunStatus[] = ['completed', 'failed', 'cancelled'];

	let lab: Lab;
	let actor: ActorContext;
	let runId: AgentRunId;

	beforeAll(async () => {
		lab = await createLab();
	});

	afterAll(async () => {
		// The executor unwinds asynchronously after the row settles; closing the
		// database underneath it logs scary-but-benign "PGlite is closing" errors.
		await new Promise((resolve) => setTimeout(resolve, 500));
		await lab?.close();
	});

	it('submits a run through the production graph', async () => {
		actor = { userId: randomUUID() as UserId };
		// Materializes the user row, the way seedWorkspace does for eval cases.
		await lab.controllers.workspace().getShellContext(actor);
		const receipt = await lab.controllers.agent().submit(actor, {
			requestId: randomUUID(),
			input: 'Smoke test, no answer needed.'
		});
		runId = receipt.runId;
		// Stop before the provider call can cost anything.
		await lab.controllers.agent().cancel(actor, receipt.runId);
		expect(receipt.status).toBe('queued');
	});

	it('settles the run out of the active slot', async () => {
		const deadline = Date.now() + 15_000;
		let status = (await lab.controllers.agent().getRun(actor, runId)).run.status;
		while (!TERMINAL.includes(status) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			status = (await lab.controllers.agent().getRun(actor, runId)).run.status;
		}
		expect(TERMINAL.includes(status)).toBe(true);
	});
});
