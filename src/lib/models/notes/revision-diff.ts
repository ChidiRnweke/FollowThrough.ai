/**
 * Compact unified diffs between two note-revision texts, for the agent's
 * version-history tools. The ProseMirror-based `note-diff.ts` serves the UI's
 * two-pane review; this module answers a different question — "what changed,
 * in as few tokens as possible" — so it diffs plain text line by line and
 * caps the patch rather than rendering whole documents.
 *
 * Pure and isomorphic: string in, string out, so it runs identically on the
 * server (agent tools) and anywhere else a text diff is wanted.
 */

import { createTwoFilesPatch } from 'diff';

/** How many patch lines a revision diff may run to before it is cut off. */
export const REVISION_DIFF_LINE_LIMIT = 200;

/** The textual content of one revision, the only input a text diff needs. */
export interface RevisionText {
	readonly revision: number;
	readonly title: string;
	readonly plainText: string;
	readonly createdAt: string;
}

export interface NoteRevisionDiff {
	readonly patch: string;
	readonly addedLines: number;
	readonly removedLines: number;
	/** True when the patch hit {@link REVISION_DIFF_LINE_LIMIT} and was cut short. */
	readonly truncated: boolean;
}

function revisionLabel(side: RevisionText): string {
	return `revision ${side.revision} (${side.createdAt.slice(0, 10)})`;
}

/**
 * Unified diff of `before` into `after`, 3 lines of context. A title change is
 * reported as a leading `title:` line since the body patch never sees it.
 * Identical inputs produce an empty patch.
 */
export function diffNoteRevisionTexts(before: RevisionText, after: RevisionText): NoteRevisionDiff {
	const titleLine = before.title === after.title ? '' : `title: ${before.title} → ${after.title}\n`;
	if (before.plainText === after.plainText) {
		return { patch: titleLine.trimEnd(), addedLines: 0, removedLines: 0, truncated: false };
	}
	const patch = createTwoFilesPatch(
		revisionLabel(before),
		revisionLabel(after),
		before.plainText,
		after.plainText,
		'',
		'',
		{ context: 3 }
	);
	const addedLines = patch
		.split('\n')
		.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
	const removedLines = patch
		.split('\n')
		.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
	const lines = patch.split('\n');
	if (lines.length <= REVISION_DIFF_LINE_LIMIT) {
		return { patch: titleLine + patch, addedLines, removedLines, truncated: false };
	}
	const truncatedPatch = [
		...lines.slice(0, REVISION_DIFF_LINE_LIMIT),
		'... diff truncated; use ls on the note versions directory, then sed the required version file'
	].join('\n');
	return { patch: titleLine + truncatedPatch, addedLines, removedLines, truncated: true };
}
