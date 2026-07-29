import { describe, expect, it } from 'vitest';
import { Registry } from './registry';

describe('Registry', () => {
	it('returns the same instance for the same key while held', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		const a = registry.for('a');
		const b = registry.for('a');
		expect({ same: a === b, held: registry.isHeld('a') }).toEqual({
			same: true,
			held: true
		});
	});

	it('creates separate instances for different keys', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		const a = registry.for('a');
		const b = registry.for('b');
		expect({ separate: a !== b, first: a.id, second: b.id }).toEqual({
			separate: true,
			first: 'a',
			second: 'b'
		});
	});

	it('destroys an instance when its last reference is released', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		registry.for('a');
		registry.release('a');
		expect({
			destroyed,
			present: registry.has('a'),
			held: registry.isHeld('a')
		}).toEqual({ destroyed: ['a'], present: false, held: false });
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
		const afterFirstRelease = {
			destroyed: [...destroyed],
			references: registry.refcount('a')
		};
		registry.release('a');
		expect({ afterFirstRelease, afterLastRelease: destroyed }).toEqual({
			afterFirstRelease: { destroyed: [], references: 1 },
			afterLastRelease: ['a']
		});
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
		expect({ rebuilt: first !== second, created }).toEqual({
			rebuilt: true,
			created: ['a', 'a']
		});
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
		expect({
			destroyed,
			firstHeld: registry.isHeld('a'),
			firstPresent: registry.has('a')
		}).toEqual({ destroyed: ['b'], firstHeld: true, firstPresent: true });
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
		let creations = 0;
		const factory = (id: string) => {
			creations += 1;
			return { id };
		};
		const registry = new Registry(factory);
		registry.for('a');
		registry.for('a');
		expect(creations).toBe(1);
	});

	it('peek returns the held instance without bumping the refcount', () => {
		const registry = new Registry<string, { id: string }>((id) => ({ id }));
		registry.for('a');
		const peeked = registry.peek('a');
		expect({ value: peeked?.id, references: registry.refcount('a') }).toEqual({
			value: 'a',
			references: 1
		});
	});

	it('peek returns undefined for keys not currently held', () => {
		const destroyed: string[] = [];
		const registry = new Registry<string, { id: string }>(
			(id) => ({ id }),
			(id) => destroyed.push(id)
		);
		const beforeObservation = registry.peek('never-opened');
		registry.for('a');
		registry.release('a');
		expect({ beforeObservation, afterRelease: registry.peek('a') }).toEqual({
			beforeObservation: undefined,
			afterRelease: undefined
		});
	});

	it('peek does not resurrect a destroyed instance', () => {
		let creations = 0;
		const factory = (id: string) => {
			creations += 1;
			return { id };
		};
		const registry = new Registry(factory);
		registry.for('a');
		registry.release('a');
		expect({ value: registry.peek('a'), creations }).toEqual({
			value: undefined,
			creations: 1
		});
	});
});
