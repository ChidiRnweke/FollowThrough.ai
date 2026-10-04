/**
 * Compact unified diffs between two note-revision texts, for the agent's
 * version-history tools. The ProseMirror-based `note-diff.ts` serves the UI's
 * two-pane review; this module answers a different question — "what changed,
 * in as few tokens as possible" — so it diffs plain text line by line without
 * dropping any changed lines.
 *
 * Pure and isomorphic: string in, string out, so it runs identically on the
 * server (agent tools) and anywhere else a text diff is wanted.
 */

import { formatPatch, structuredPatch } from 'diff';
import { type RevisionText, type NoteRevisionDiff } from '$lib/models/notes/revision-diff';

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
		return { patch: titleLine.trimEnd(), addedLines: 0, removedLines: 0 };
	}
	const changes = structuredPatch(
		revisionLabel(before),
		revisionLabel(after),
		before.plainText,
		after.plainText,
		'',
		'',
		{ context: 3 }
	);
	const changedLines = changes.hunks.flatMap((hunk) => hunk.lines);
	const addedLines = changedLines.filter((line) => line.startsWith('+')).length;
	const removedLines = changedLines.filter((line) => line.startsWith('-')).length;
	const patch = formatPatch(changes);
	return { patch: titleLine + patch, addedLines, removedLines };
}
