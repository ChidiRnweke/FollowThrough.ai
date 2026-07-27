/**
 * The conversion itself is isomorphic and lives with the editor schema it depends on, so
 * the approval card can preview a patch in the browser exactly as the server will apply
 * it. This module keeps the import path the agent tooling already uses.
 */
export {
	noteContentFromMarkdown,
	noteMarkdownFromContent,
	type NoteMarkdownContent
} from '$lib/components/edra/commands/note-markdown';
