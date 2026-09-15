import { describe, expect, it } from 'vitest';
import { workspaceAccountCookieName } from '$lib/models/workspace-bootstrap';
import { deleteSessionCookie, setWorkspaceAccountCookie } from './config';

describe('workspace account cookie', () => {
	it('clears offline account access together with the authenticated session', () => {
		const cookies = new Map([
			['session', 'test-session'],
			[workspaceAccountCookieName, 'account']
		]);
		const remove: Parameters<typeof deleteSessionCookie>[0]['delete'] = (name) => {
			cookies.delete(name);
		};
		deleteSessionCookie({ delete: remove });
		expect([...cookies]).toEqual([]);
	});
	it('exposes only the account hint to the browser, leaving the session cookie untouched', () => {
		const cookies = new Map<string, { value: string; httpOnly: boolean }>([
			['session', { value: 'test-session', httpOnly: true }]
		]);
		const set: Parameters<typeof setWorkspaceAccountCookie>[0]['set'] = (name, value, options) => {
			cookies.set(name, { value, httpOnly: options.httpOnly });
		};
		setWorkspaceAccountCookie(
			{ set, get: (name) => cookies.get(name)?.value },
			'a0000000-0000-4000-8000-000000000001',
			true,
			1000
		);
		expect([...cookies]).toEqual([
			['session', { value: 'test-session', httpOnly: true }],
			[
				workspaceAccountCookieName,
				{ value: 'a0000000-0000-4000-8000-000000000001', httpOnly: false }
			],
			['workspace_account_renewed', { value: '1000', httpOnly: true }]
		]);
	});
});

it('does not rewrite a fresh account cookie on ordinary authenticated requests', () => {
	const writes: string[] = [];
	setWorkspaceAccountCookie(
		{
			get: (name) => (name === 'workspace_account' ? 'account' : '1000'),
			set: (name) => {
				writes.push(name);
			}
		},
		'account',
		true,
		2000
	);
	expect(writes).toEqual([]);
});
it('renews a long-lived account hint before it expires', () => {
	const writes: string[] = [];
	setWorkspaceAccountCookie(
		{
			get: (name) => (name === 'workspace_account' ? 'account' : '1000'),
			set: (name) => {
				writes.push(name);
			}
		},
		'account',
		true,
		1000 + 16 * 24 * 60 * 60 * 1000
	);
	expect(writes).toEqual(['workspace_account', 'workspace_account_renewed']);
});
