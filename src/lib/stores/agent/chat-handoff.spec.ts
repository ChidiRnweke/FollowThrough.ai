import { describe, expect, it } from 'vitest';
import { consumeChatHandoff, stageChatHandoff } from './chat-handoff';

class MemoryStorage implements Storage {
	private readonly values = new Map<string, string>();
	get length(): number {
		return this.values.size;
	}
	clear(): void {
		this.values.clear();
	}
	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}
	key(index: number): string | null {
		return [...this.values.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.values.delete(key);
	}
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

describe('Chat handoff lifecycle', () => {
	it('retains the complete handoff context', () => {
		const storage = new MemoryStorage();
		const handoff = { prompt: 'Review this', requestedSkillNames: ['Reviewer'] };
		stageChatHandoff(handoff, storage);
		expect(consumeChatHandoff(storage)).toEqual(handoff);
	});

	it('is consumed exactly once', () => {
		const storage = new MemoryStorage();
		stageChatHandoff({ prompt: 'Review this' }, storage);
		consumeChatHandoff(storage);
		expect(consumeChatHandoff(storage)).toBeUndefined();
	});
});
