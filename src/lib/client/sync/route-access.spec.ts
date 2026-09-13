import { expect, it } from 'vitest';
import { z } from 'zod';
import { requireRouteResource, routeResourceId } from './route-access';

it('reports a malformed resource identity as not found', () => {
	expect(() => routeResourceId(z.string().uuid(), 'invalid')).toThrow(
		expect.objectContaining({ status: 404 })
	);
});
it('reports an unknown online resource as not found without inventing deletion', () => {
	expect(() => requireRouteResource({ kind: 'unavailable' }, true, 'chat')).toThrow(
		expect.objectContaining({ status: 404 })
	);
});
it('keeps offline absence distinct from an authoritative deletion', () => {
	expect(() => requireRouteResource({ kind: 'unavailable' }, false, 'chat')).toThrow(
		expect.objectContaining({ status: 503 })
	);
});
it('preserves an authoritative deletion', () => {
	expect(() => requireRouteResource({ kind: 'deleted' }, true, 'chat')).toThrow(
		expect.objectContaining({ status: 410 })
	);
});
it('keeps a failed online read distinct from not found', () => {
	expect(() =>
		requireRouteResource({ kind: 'failure', message: 'Unavailable service' }, true, 'chat')
	).toThrow(
		expect.objectContaining({
			status: 503,
			body: expect.objectContaining({ message: 'Unavailable service' })
		})
	);
});
