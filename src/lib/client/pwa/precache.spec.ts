import { describe, expect, it } from 'vitest';
import { precacheRequests } from './precache';

describe('release installation cache policy', () => {
	it('requires fresh responses even for a shell URL retained between releases', () => {
		const requests = precacheRequests([
			'https://app.example/offline-shell.html',
			'https://app.example/_app/immutable/app.js'
		]);
		expect(requests.map((request) => ({ url: request.url, cache: request.cache }))).toEqual([
			{ url: 'https://app.example/offline-shell.html', cache: 'reload' },
			{ url: 'https://app.example/_app/immutable/app.js', cache: 'reload' }
		]);
	});
});
