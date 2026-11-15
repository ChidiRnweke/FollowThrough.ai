import { describe, expect, it } from 'vitest';
import { withResponseHeaders } from './response-headers';

const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());

describe('response headers', () => {
	it('tells the browser not to sniff, frame, over-share the referrer or grant devices', () => {
		const response = withResponseHeaders(
			new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } })
		);
		expect(headersOf(response)).toEqual({
			'content-type': 'text/html',
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'strict-origin-when-cross-origin',
			'x-frame-options': 'DENY',
			'content-security-policy': "frame-ancestors 'none'",
			'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
		});
	});

	it("keeps a route's own policy and adds the headers it left out", () => {
		const icon = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
		const response = withResponseHeaders(
			new Response('<svg/>', {
				headers: { 'content-type': 'image/svg+xml', 'content-security-policy': icon }
			})
		);
		expect({
			policy: response.headers.get('content-security-policy'),
			framing: response.headers.get('x-frame-options')
		}).toEqual({ policy: icon, framing: 'DENY' });
	});

	it('adds the headers to a redirect a route answers with', () => {
		const response = withResponseHeaders(
			new Response(null, { status: 302, headers: { location: 'https://storage.example/object' } })
		);
		expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});
});
