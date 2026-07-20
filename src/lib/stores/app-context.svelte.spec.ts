import { describe, expect, it } from 'vitest';
import { surfaceFor } from './app-context.svelte';

describe('application surface mapping', () => {
	it.each([
		['/', 'today'],
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

	it('drops query parameters outside the filter allowlist', () => {
		expect(surfaceFor('/todos', new URLSearchParams('secret=x&status=open')).filters).toEqual({
			status: 'open'
		});
	});
});
