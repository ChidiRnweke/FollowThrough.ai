import { describe, expect, it } from 'vitest';
import type { DateTime } from '$lib/models/common';
import type { UserId } from '$lib/models/identity';
import type { ShellContext } from '$lib/models/workspace-views';
import { InMemoryWorkbenchRouter } from '$lib/testing/workbench/fakes/in-memory-router';
import { WorkbenchStore } from '../workbench/workbench.svelte';
import { AppContextStore } from './app-context.svelte';

const shell: ShellContext = {
	user: {
		id: '00000000-0000-4000-8000-000000000001' as UserId,
		email: 'ada@example.com',
		displayName: 'Ada',
		role: 'USER',
		createdAt: '2026-07-11T09:00:00.000Z' as DateTime,
		updatedAt: '2026-07-11T09:00:00.000Z' as DateTime
	},
	projects: [],
	noteTree: [],
	skills: [],
	pendingSuggestionCount: 0,
	pendingMemoryNotifications: []
};

// `capture` reads the browser's layout query; Node has none.
globalThis.matchMedia = (query: string): MediaQueryList =>
	({ matches: false, media: query }) as MediaQueryList;

const surfaceFor = (path: string, params: URLSearchParams) => {
	const url = new URL(`${path}?${params.toString()}`, 'http://localhost');
	const appContext = new AppContextStore(
		new WorkbenchStore(new InMemoryWorkbenchRouter(`${url.pathname}${url.search}`))
	);
	appContext.configure(shell, url, []);
	return appContext.capture().surface;
};

describe('application surface mapping', () => {
	it.each([
		['/today', 'today'],
		['/todos', 'todos'],
		['/projects/p1', 'project'],
		['/projects/p1/todos', 'project_todos'],
		['/projects/p1/memory', 'project_memory'],
		['/projects/p1/attachments', 'project_attachments'],
		['/artifacts', 'artifacts'],
		['/notes/n1', 'note_workbench'],
		['/notes/n1/diagrams/d1', 'diagram_editor'],
		['/chats', 'chats'],
		['/chats/c1', 'chat'],
		['/skills', 'skills'],
		['/skills/s1', 'skill'],
		['/profile', 'profile'],
		['/settings', 'settings']
	])('maps %s to %s', (path, expected) => {
		expect(surfaceFor(path, new URLSearchParams()).kind).toBe(expected);
	});

	it('recognises the studio when a draft canvas is split beside a chat', () => {
		expect(
			surfaceFor(
				'/chats/new',
				new URLSearchParams('tabs=chat:a,draft:a&focus=chat:a&split=draft:a')
			).kind
		).toBe('diagram_studio');
	});

	it('recognises the studio when a saved diagram is a workbench tab', () => {
		expect(
			surfaceFor('/notes/n1', new URLSearchParams('tabs=n1,diagram:d1&focus=n1&split=diagram:d1'))
				.kind
		).toBe('diagram_studio');
	});

	it('recognises a focused widget tab', () => {
		expect(
			surfaceFor(
				'/widgets/77777777-7777-4777-8777-777777777777',
				new URLSearchParams(
					'tabs=n1,widget:77777777-7777-4777-8777-777777777777&focus=widget:77777777-7777-4777-8777-777777777777'
				)
			).kind
		).toBe('widget');
	});

	it('recognises the standalone widget page', () => {
		expect(surfaceFor('/widgets/w1', new URLSearchParams()).kind).toBe('widget');
	});

	it('leaves an ordinary note workbench alone', () => {
		expect(surfaceFor('/notes/n1', new URLSearchParams('tabs=n1,n2&focus=n1')).kind).toBe(
			'note_workbench'
		);
	});

	it('drops query parameters outside the filter allowlist', () => {
		expect(surfaceFor('/todos', new URLSearchParams('secret=x&status=open')).filters).toEqual({
			status: 'open'
		});
	});
});
