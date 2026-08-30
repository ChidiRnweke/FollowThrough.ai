import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteEditor from './note-editor.svelte';
import '../../../routes/layout.css';
import {
	findProseMirrorDocumentIssue,
	parseProseMirrorDocument,
	type NoteId,
	type ProseMirrorDocument
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import corpusDocuments from '../../../../tests/corpus/note-documents.json' with { type: 'json' };

/**
 * Opening a note, the way a page opens one.
 *
 * Nothing tested this, and it stayed broken across two fixes because of it. The
 * other specs in this directory hand the editor a hand-written document as a
 * plain object; a route hands it `$state`, which is a Proxy. `toEditorContent`
 * called `structuredClone` on it and threw `DataCloneError` on every note, with
 * the whole suite green. Before that, the strict schema rejected the stored
 * document outright. Both are the same missing test: open a real note.
 *
 * So this uses a real stored document from the corpus, held in reactive state,
 * and mounts the real editor. Both halves matter — the document comes from the
 * database rather than from this file, and the container is the one production
 * uses.
 *
 * It lives apart from `note-editor.svelte.spec.ts` deliberately. That file's
 * tests share one browser page and one of them is timing-sensitive; loading the
 * corpus alongside them was enough to make it flake.
 */

const PROJECT_ID = '00000000-0000-4000-8000-000000000004' as ProjectId;

/** The richest document in the corpus: headings, tables, lists, marks, images. */
const storedDocument = (): ProseMirrorDocument =>
	parseProseMirrorDocument(
		corpusDocuments.reduce((largest, candidate) =>
			JSON.stringify(candidate).length > JSON.stringify(largest).length ? candidate : largest
		)
	);

const openNote = (document: ProseMirrorDocument) =>
	render(NoteEditor, {
		noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
		projectId: PROJECT_ID,
		revision: 1,
		document,
		onreviseMermaid: async (source: string) => ({ source }),
		onconvertMermaid: async () => {
			throw new Error('Not used by this test');
		},
		onrejectDrawio: async () => undefined
	});

/** `EditorContent` mounts the view an effect later than the first render. */
const settle = () =>
	new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));

describe('opening a stored note', () => {
	it('renders a real stored document held in reactive state', async () => {
		const state = $state({ document: storedDocument() });
		const screen = openNote(state.document);
		await settle();

		expect(screen.container.querySelector('[contenteditable="true"]')?.textContent).not.toBe('');
	});

	it('puts every top-level block of it on screen', async () => {
		const document = storedDocument();
		const state = $state({ document });
		const screen = openNote(state.document);
		await settle();

		expect(screen.component.getEditor()?.state.doc.childCount).toBe(document.content?.length);
	});

	// `getDocument` is what a save posts, and `remote/notes` parses it with the
	// strict schema. A note that opens but cannot be saved is still broken, and
	// that was true for the whole time the schema rejected `textAlign: null`.
	it('gives back a document its own save path accepts', async () => {
		const state = $state({ document: storedDocument() });
		const screen = openNote(state.document);
		await settle();

		expect(findProseMirrorDocumentIssue(screen.component.getDocument())).toBeUndefined();
	});
});
