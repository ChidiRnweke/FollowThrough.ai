import type { StoredProofreadingDictionary } from '$lib/models/proofreading';
import type { ProofreadingPreferences } from '$lib/controllers/notes/proofreading';
const DICTIONARY_KEY = 'followthrough.proofreading.dictionary';
export const readWords = (): StoredProofreadingDictionary => {
	const raw = localStorage.getItem(DICTIONARY_KEY);
	if (raw === null) return { kind: 'words', words: [] };
	try {
		const stored: unknown = JSON.parse(raw);
		if (!Array.isArray(stored) || stored.some((word) => typeof word !== 'string'))
			return { kind: 'corrupt' };
		return { kind: 'words', words: stored };
	} catch {
		return { kind: 'corrupt' };
	}
};

export class BrowserProofreadingPreferences implements ProofreadingPreferences {
	read() {
		return typeof localStorage === 'undefined'
			? undefined
			: {
					enabled: localStorage.getItem('followthrough.proofreading.enabled') !== 'false',
					dictionary: readWords()
				};
	}
	setEnabled(enabled: boolean) {
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('followthrough.proofreading.enabled', String(enabled));
	}
	saveWords(words: readonly string[]) {
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(DICTIONARY_KEY, JSON.stringify(words));
	}
	resetCorruptDictionary() {
		console.warn('The saved proofreading dictionary could not be read; it has been reset.');
		localStorage.removeItem(DICTIONARY_KEY);
	}
}
