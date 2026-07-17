import type { ServerInit } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';

export const init: ServerInit = async () => {
	if (process.env.npm_lifecycle_event === 'build' || process.env.NODE_ENV === 'test') return;
	const recovered = await AppFactory.recoverInterruptedRuns();
	if (recovered > 0)
		console.log(`[agent-run] Recovered ${recovered} interrupted run(s) on startup`);
};
