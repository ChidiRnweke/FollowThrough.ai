// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { ProofreadIssue, ProofreadLinter } from '$lib/models/proofreading';
import { ProofreadingStore } from './proofreading.svelte';

/** A linter that records what it was told, so no WebAssembly is booted here. */
const recordingLinter = () => {
	const learned: string[] = [];
	let setups = 0;
	const linter: ProofreadLinter = {
		setup: async () => {
			setups += 1;
		},
		lint: async () => [],
		addWord: async (word) => {
			learned.push(word);
		}
	};
	return { linter, learned, setupCount: () => setups };
};

const store = (linter: ProofreadLinter) => new ProofreadingStore(() => linter);

const issue = (text: string): ProofreadIssue => ({
	start: 0,
	end: text.length,
	message: 'Did you mean to spell this differently?',
	kind: 'Spelling',
	text,
	suggestions: []
});

describe('ProofreadingStore', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('checks by default, so nobody has to go and find it', () => {
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(proofreading.enabled).toBe(true);
	});

	it('stays on when storage holds nothing but unrelated keys', () => {
		localStorage.setItem('followthrough.proofreading.dictionary', '["nweke"]');
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(proofreading.enabled).toBe(true);
	});

	it('respects a reader who turned it off on this device', () => {
		localStorage.setItem('followthrough.proofreading.enabled', 'false');
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(proofreading.enabled).toBe(false);
	});

	it('downloads nothing while only reading preferences', () => {
		const { linter, setupCount } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(setupCount()).toBe(0);
	});

	it('starts loading the checker the moment it is deliberately switched on', () => {
		const { linter, setupCount } = recordingLinter();
		const proofreading = store(linter);
		proofreading.setEnabled(true);
		expect(setupCount()).toBe(1);
	});

	it('does not load the checker when it is switched off', () => {
		const { linter, setupCount } = recordingLinter();
		const proofreading = store(linter);
		proofreading.setEnabled(false);
		expect(setupCount()).toBe(0);
	});

	it('remembers being switched off for the next session', () => {
		const { linter } = recordingLinter();
		store(linter).setEnabled(false);
		const next = store(recordingLinter().linter);
		next.hydrate();
		expect(next.enabled).toBe(false);
	});

	it('restores a dictionary word saved on a previous visit', () => {
		localStorage.setItem('followthrough.proofreading.dictionary', '["nweke"]');
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(proofreading.accepted([issue('Nweke')])).toHaveLength(0);
	});

	it('teaches a new word to the live linter', () => {
		const { linter, learned } = recordingLinter();
		store(linter).addWord('Nweke');
		expect(learned).toEqual(['nweke']);
	});

	it('stops flagging a word as soon as it is added, without waiting for a re-check', () => {
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.addWord('Nweke');
		expect(proofreading.accepted([issue('Nweke')])).toHaveLength(0);
	});

	it('survives a dictionary entry that is not readable JSON', () => {
		localStorage.setItem('followthrough.proofreading.dictionary', 'not json');
		const { linter } = recordingLinter();
		const proofreading = store(linter);
		proofreading.hydrate();
		expect(proofreading.dictionary.size).toBe(0);
	});
});
