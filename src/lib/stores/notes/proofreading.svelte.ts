import { HarperLinter } from '$lib/client/proofreading/harper-linter';
import { SvelteSet } from 'svelte/reactivity';
import {
	normalizeDictionaryWord,
	withoutIgnoredWords,
	type ProofreadIssue,
	type ProofreadLinter
} from '$lib/models/proofreading';

const ENABLED_KEY = 'followthrough.proofreading.enabled';
const DICTIONARY_KEY = 'followthrough.proofreading.dictionary';

/**
 * The user's proofreading preference and their personal dictionary, plus the one
 * linter every open note shares.
 *
 * Both settings are read synchronously from localStorage rather than the server:
 * the checker is a client-side capability with no server state to reconcile, and
 * a preference fetched after mount would spend the first seconds of every note
 * underlining words the user had already dismissed.
 *
 * The dictionary is per-device for now — teaching it a word on a laptop does not
 * reach a phone. Syncing it needs a controller, a remote command and a migration;
 * see the plan's follow-ups.
 */
export class ProofreadingStore {
	/**
	 * On unless the user has turned it off. A checker you have to go and find in an
	 * overflow menu is a checker nobody uses, and a writing app that ships one and
	 * hides it has not shipped it.
	 *
	 * What this does *not* do is download anything on app start: the binary is
	 * fetched by the first note that opens, so a session spent on Today or a todo
	 * board never pays for it. See `hydrate`.
	 */
	enabled = $state(true);
	/**
	 * Normalized words the writer has taught the checker. A `SvelteSet` so adding
	 * one re-runs the filter that reads it, without the whole set being replaced
	 * on every addition.
	 */
	readonly dictionary = new SvelteSet<string>();

	private linterInstance?: ProofreadLinter;

	/**
	 * The linter is constructed through a factory so a test can hold this store to
	 * account without booting a 16 MB WebAssembly binary to do it.
	 */
	constructor(private readonly createLinter: () => ProofreadLinter = () => new HarperLinter()) {}

	/**
	 * Reads both preferences. Safe to call repeatedly; a no-op on the server.
	 *
	 * Only an explicit "off" is stored, so the default is a property of the code
	 * rather than of whatever happened to be written to a device once. Nothing is
	 * warmed here: the extension runs its first pass when a note editor mounts,
	 * and that is what pulls the binary down.
	 */
	hydrate(): void {
		if (typeof localStorage === 'undefined') return;
		this.enabled = localStorage.getItem(ENABLED_KEY) !== 'false';
		const stored = readWords();
		if (stored.kind === 'corrupt') {
			// Dropped rather than left in place: nothing can recover it, and leaving it
			// means failing this way on every mount from here on. That loses the
			// writer's accepted words, so it is said out loud — they are about to see
			// underlines return under names they had approved, and this is the only
			// thing that explains why.
			console.warn('The saved proofreading dictionary could not be read; it has been reset.');
			localStorage.removeItem(DICTIONARY_KEY);
			return;
		}
		for (const word of stored.words) this.dictionary.add(word);
	}

	/**
	 * The shared linter, created on first use. One per tab rather than one per
	 * editor: two open note panes would otherwise each hold a worker and a
	 * separate copy of the binary, and their dictionaries would drift apart.
	 */
	linter(): ProofreadLinter {
		this.linterInstance ??= this.createLinter();
		return this.linterInstance;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (typeof localStorage !== 'undefined') localStorage.setItem(ENABLED_KEY, String(enabled));
		// Warm the binary the moment it is switched back on. Unlike the default
		// path this is a deliberate act, so the reader is expecting something to
		// happen and the download should already be running when it does.
		if (enabled) void this.linter().setup();
	}

	/**
	 * Teach the checker a word. Persisted for the next session and pushed into the
	 * live linter, so the underline clears without a reload.
	 */
	addWord(word: string): void {
		const normalized = normalizeDictionaryWord(word);
		if (normalized === '' || this.dictionary.has(normalized)) return;
		this.dictionary.add(normalized);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(DICTIONARY_KEY, JSON.stringify([...this.dictionary]));
		void this.linter().addWord(normalized);
	}

	/**
	 * Filter a pass through the dictionary before it is drawn.
	 *
	 * Harper is told about the words too, but this is the check that actually
	 * clears an underline the instant the writer adds one: the linter's own
	 * dictionary only takes effect on the next pass, and the block the caret is in
	 * will not be re-linted until they stop typing.
	 */
	accepted(issues: readonly ProofreadIssue[]): readonly ProofreadIssue[] {
		return withoutIgnoredWords(issues, this.dictionary);
	}
}

/**
 * What the stored dictionary turned out to be.
 *
 * Corruption is a value rather than an exception or an empty list. As a throw it
 * escaped `hydrate`, which runs on every note editor mount — so one bad entry in
 * one browser broke proofreading on that device for good. As an empty list it
 * would be indistinguishable from a writer who has accepted no words, and the
 * entry would sit there failing the same way on every mount forever.
 */
type StoredDictionary =
	{ readonly kind: 'words'; readonly words: readonly string[] } | { readonly kind: 'corrupt' };

const readWords = (): StoredDictionary => {
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

export const proofreading = new ProofreadingStore();
