import { describe, expect, it } from 'vitest';
import { chatStarters, starterSurface } from './chat-starters';

describe('Starter surface follows what the user is looking at', () => {
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
		expect(starterSurface({ hasNote: false, hasProject: false, pathname: '/today' })).toBe(
			'unscoped'
		);
	});
});

describe('Starters stay a short, actionable list', () => {
	it('offers three actionable starters per surface with explicit targets', () => {
		const surfaces = ['note', 'todos', 'project', 'unscoped'] as const;
		const counts = surfaces.map((surface) => chatStarters(surface).length);
		const all = (['note', 'todos', 'project', 'unscoped'] as const).flatMap((surface) => [
			...chatStarters(surface)
		]);
		expect({
			counts,
			bareQuestion: all.some((starter) => starter.prompt.endsWith('?')),
			validTargets: all.every((starter) => ['notes', 'todos', 'memory'].includes(starter.target))
		}).toEqual({ counts: [3, 3, 3, 3], bareQuestion: false, validTargets: true });
	});
});
