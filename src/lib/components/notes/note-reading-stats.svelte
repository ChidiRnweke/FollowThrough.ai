<script lang="ts">
	import { getEditor, useEditorState } from '$lib/components/edra/commands/index.js';
	import { readingMinutes } from '$lib/models/notes/reading-time';

	/**
	 * How much note there is, and how long it takes.
	 *
	 * A strip rather than a floating chip. A chip pinned to the corner sits on top of the
	 * prose at every width — the reading measure is centred, so there is no gutter wide
	 * enough to hold it — and text half-covered by a box reads as a rendering fault. A
	 * full-width strip with its own ground is chrome instead: the document scrolls behind a
	 * bottom edge, which is what a bottom edge is for.
	 *
	 * Quiet by construction: a caption rather than a control, never announced (the value
	 * changes on every keystroke, which no screen reader should have to read aloud), and
	 * never clickable.
	 */

	const editor = getEditor();

	const stats = useEditorState({
		editor,
		selector: ({ editor }) => ({
			words: (editor.storage.characterCount as { words: () => number } | undefined)?.words() ?? 0
		})
	});

	const words = $derived($stats.words);
	const minutes = $derived(readingMinutes(words));
	const count = $derived(`${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`);
</script>

{#if words > 0}
	<div
		class="note-reading-stats sticky bottom-0 z-30 flex justify-end border-t border-border bg-background px-3"
	>
		<span class="provenance-caption" aria-hidden="true">
			{count}<span class="pl-1">· {minutes} min read</span>
		</span>
	</div>
{/if}
