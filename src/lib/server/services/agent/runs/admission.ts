import type { ExecutingRunCounts, RunAdmission, RunAdmissionLimits } from '$lib/models/agent';

type RunRefusal = Extract<RunAdmission, { kind: 'refused' }>;

/** Whether one more chat run may start beside the runs that execute now (ADR 0053). */
export interface RunAdmissionRule {
	admit(executing: ExecutingRunCounts): RunAdmission;
	/**
	 * Why a run did not start, for its owner. `requested`: the owner asked just now and reads
	 * this at once. `scheduled`: a schedule's time came, and the owner reads this later.
	 */
	refusal(refused: RunRefusal, start: 'requested' | 'scheduled'): string;
}

export class RunAdmissionRules implements RunAdmissionRule {
	constructor(private readonly limits: RunAdmissionLimits) {}

	admit(executing: ExecutingRunCounts): RunAdmission {
		// The account's own limit is named first: it is the one its owner can do something about.
		if (executing.account >= this.limits.perAccount)
			return { kind: 'refused', limit: 'account', executing: executing.account };
		if (executing.total >= this.limits.total)
			return { kind: 'refused', limit: 'total', executing: executing.total };
		return { kind: 'admitted' };
	}

	refusal(refused: RunRefusal, start: 'requested' | 'scheduled'): string {
		// The deployment total is not the user's to know, so only their own count is named.
		if (refused.limit === 'total')
			return start === 'requested'
				? 'This server is running as many agent runs as it allows. Try again in a moment.'
				: 'This scheduled run did not start: the server was running as many agent runs as it allows. Retry it later.';
		const runs = `${refused.executing} agent ${refused.executing === 1 ? 'run' : 'runs'}`;
		if (start === 'requested') return `You have ${runs} in progress. Wait for one to finish.`;
		return `This scheduled run did not start: you had ${runs} in progress. Retry it when one finishes.`;
	}
}
