import { expect, it } from 'vitest';
import { error, redirect } from '@sveltejs/kit';
import { prepareRoute } from './route-access';

it('preserves a deleted record result in the content outlet', async () => {
	expect(await prepareRoute(async () => error(410, 'This note was deleted'))).toEqual({
		kind: 'failure',
		status: 410,
		message: 'This note was deleted'
	});
});

it('preserves not-found separately from transport failure', async () => {
	expect(await prepareRoute(async () => error(404, 'This project was not found'))).toEqual({
		kind: 'failure',
		status: 404,
		message: 'This project was not found'
	});
});

it('makes early request rejection an explicit failure', async () => {
	expect(
		await prepareRoute(async () => {
			throw new Error('Connection interrupted');
		})
	).toEqual({ kind: 'failure', status: 503, message: 'Connection interrupted' });
});

it('retains a canonical redirect after deferred inventory validation', async () => {
	expect(await prepareRoute(async () => redirect(303, '/artifacts?projectId=inbox'))).toEqual({
		kind: 'redirect',
		location: '/artifacts?projectId=inbox'
	});
});
