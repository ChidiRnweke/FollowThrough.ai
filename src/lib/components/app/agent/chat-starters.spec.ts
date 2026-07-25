import { describe, expect, it } from 'vitest';
import { chatStarters, starterSurface } from './chat-starters';

describe('Starter surface follows what the user is looking at', () => {
	it('offers note starters when a note is in focus', () => {
		expect(starterSurface({ hasNote: true, hasProject: true, pathname: '/notes/abc' })).toBe(
			'note'
		);
	});

	it('prefers the note over the route when both could apply', () => {
		expect(starterSurface({ hasNote: true, hasProject: true, pathname: '/projects/a/todos' })).toBe(
			'note'
		);
	});

	it('offers todo starters on a todos route with no note open', () => {
		expect(
			starterSurface({ hasNote: false, hasProject: true, pathname: '/projects/a/todos' })
		).toBe('todos');
	});

	it('offers project starters when only a project is in scope', () => {
		expect(starterSurface({ hasNote: false, hasProject: true, pathname: '/projects/a' })).toBe(
			'project'
		);
	});

	it('falls back to unscoped starters with nothing in scope', () => {
		expect(starterSurface({ hasNote: false, hasProject: false, pathname: '/' })).toBe('unscoped');
	});
});

describe('Starters stay a short, actionable list', () => {
	it('offers three starters per surface, never a menu', () => {
		const counts = (['note', 'todos', 'project', 'unscoped'] as const).map(
			(surface) => chatStarters(surface).length
		);
		expect(counts).toEqual([3, 3, 3, 3]);
	});

	it('never opens a starter with a bare question, because the agent also writes', () => {
		const all = (['note', 'todos', 'project', 'unscoped'] as const).flatMap((surface) => [
			...chatStarters(surface)
		]);
		expect(all.some((starter) => starter.prompt.endsWith('?'))).toBe(false);
	});

	it('names the surface each starter writes to, so the row can show it', () => {
		const all = (['note', 'todos', 'project', 'unscoped'] as const).flatMap((surface) => [
			...chatStarters(surface)
		]);
		expect(all.every((starter) => ['notes', 'todos', 'memory'].includes(starter.target))).toBe(
			true
		);
	});
});
