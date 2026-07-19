import { describe, expect, it, vi } from 'vitest';
import { Registry } from './registry';

describe('Registry', () => {
	it('returns the same instance for the same key while held', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		const a = registry.for('a');
		const b = registry.for('a');
		expect(a).toBe(b);
		expect(registry.isHeld('a')).toBe(true);
	});

	it('creates separate instances for different keys', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		const a = registry.for('a');
		const b = registry.for('b');
		expect(a).not.toBe(b);
		expect(a.id).toBe('a');
		expect(b.id).toBe('b');
	});

	it('destroys an instance when its last reference is released', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		registry.for('a');
		registry.release('a');
		expect(destroyed).toEqual(['a']);
		expect(registry.has('a')).toBe(false);
		expect(registry.isHeld('a')).toBe(false);
	});

	it('keeps the instance alive until every reference is released', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		registry.for('a');
		registry.for('a');
		registry.release('a');
		expect(destroyed).toEqual([]);
		expect(registry.refcount('a')).toBe(1);
		registry.release('a');
		expect(destroyed).toEqual(['a']);
	});

	it('rebuilds an instance after destruction', () => {
		const created: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => {
				created.push(id);
				return { id };
			},
			() => undefined
		);
		const first = registry.for('a');
		registry.release('a');
		const second = registry.for('a');
		expect(first).not.toBe(second);
		expect(created).toEqual(['a', 'a']);
	});

	it('does not destroy instances that are still held', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		registry.for('a');
		registry.for('b');
		registry.release('b');
		expect(destroyed).toEqual(['b']);
		expect(registry.isHeld('a')).toBe(true);
		expect(registry.has('a')).toBe(true);
	});

	it('ignores releases for keys that were never observed', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		registry.release('never-opened');
		expect(destroyed).toEqual([]);
	});

	it('invokes the factory lazily', () => {
		const factory = vi.fn((id: string) => ({ id }));
		const registry = new Registry(factory);
		registry.for('a');
		registry.for('a');
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('peek returns the held instance without bumping the refcount', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		registry.for('a');
		const peeked = registry.peek('a');
		expect(peeked).toBeDefined();
		expect(peeked?.id).toBe('a');
		expect(registry.refcount('a')).toBe(1);
	});

	it('peek returns undefined for keys not currently held', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		expect(registry.peek('never-opened')).toBeUndefined();
		registry.for('a');
		registry.release('a');
		expect(registry.peek('a')).toBeUndefined();
	});

	it('peek does not resurrect a destroyed instance', () => {
		const factory = vi.fn((id: string) => ({ id }));
		const registry = new Registry(factory);
		registry.for('a');
		registry.release('a');
		expect(registry.peek('a')).toBeUndefined();
		expect(factory).toHaveBeenCalledTimes(1);
	});
});
