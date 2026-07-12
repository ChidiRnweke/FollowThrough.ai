import { json } from '@sveltejs/kit';
import type { UpdateTrustPolicyInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as UpdateTrustPolicyInput;
	const factory = AppFactory.controllerFactory();
	const output = await factory.trustPolicies().update(AppFactory.actor(), input);
	return json(output);
};
