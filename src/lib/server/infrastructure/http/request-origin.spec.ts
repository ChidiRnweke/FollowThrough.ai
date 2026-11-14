import { describe, expect, it } from 'vitest';
import { isForbiddenCrossSiteForm } from './request-origin';

const SELF = 'https://notes.example';

const post = (path: string, headers: Record<string, string>, method = 'POST'): [Request, URL] => {
	const url = new URL(path, SELF);
	return [new Request(url, { method, headers }), url];
};

const form = { 'content-type': 'application/x-www-form-urlencoded' };

describe('cross-site form submissions', () => {
	it.each([
		['the consent approval', '/oauth/authorize?client_id=x&/approve'],
		['sign-out', '/auth/logout']
	])('refuses %s posted from another origin', (_case, path) => {
		expect(
			isForbiddenCrossSiteForm(...post(path, { ...form, origin: 'https://attacker.example' }))
		).toBe(true);
	});

	it('refuses a form post that names no origin', () => {
		expect(isForbiddenCrossSiteForm(...post('/oauth/authorize?/approve', form))).toBe(true);
	});

	it.each(['multipart/form-data; boundary=x', 'text/plain', 'application/x-sveltekit-formdata'])(
		'refuses a cross-site %s submission',
		(contentType) => {
			expect(
				isForbiddenCrossSiteForm(
					...post('/auth/logout', { 'content-type': contentType, origin: 'https://a.example' })
				)
			).toBe(true);
		}
	);

	it('accepts a form post from the app itself', () => {
		expect(isForbiddenCrossSiteForm(...post('/auth/logout', { ...form, origin: SELF }))).toBe(
			false
		);
	});
});

describe('the OAuth token endpoint', () => {
	it.each([
		['no origin', {}],
		['a client origin', { origin: 'https://claude.ai' }]
	])('accepts a token request with %s', (_case, headers) => {
		expect(isForbiddenCrossSiteForm(...post('/oauth/token', { ...form, ...headers }))).toBe(false);
	});
});

describe('requests that are not form submissions', () => {
	it('accepts a cross-site JSON post, which a browser cannot send without a preflight', () => {
		expect(
			isForbiddenCrossSiteForm(
				...post('/oauth/register', {
					'content-type': 'application/json',
					origin: 'https://claude.ai'
				})
			)
		).toBe(false);
	});

	it('accepts a cross-site form GET', () => {
		const url = new URL('/oauth/authorize?client_id=x', SELF);
		const request = new Request(url, { headers: { ...form, origin: 'https://claude.ai' } });
		expect(isForbiddenCrossSiteForm(request, url)).toBe(false);
	});
});
