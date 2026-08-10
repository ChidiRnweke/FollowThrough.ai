<script lang="ts">
	import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
	import { getNoteRevision, listNoteRevisions } from '$lib/remote/notes/notes.remote';
	import NoteVersionDiff from '../../../notes/note-version-diff.svelte';

	let {
		noteId,
		revision
	}: {
		noteId: string;
		/** The revision this call produced. Absent when the tool did not report one. */
		revision?: number;
	} = $props();

	/**
	 * The snapshot this call wrote, and the one before it.
	 *
	 * Both sides are revisions rather than "the note as it stands now", and that is the whole
	 * point: a settled row has to keep showing what *that* call did, and diffing against the
	 * live note would quietly turn into a diff of everything that happened since.
	 *
	 * Fetched on first expand, never on render. A turn can carry a dozen of these rows and
	 * loading every note's history to draw a list nobody opened is the reason the door exists.
	 */
	type Sides = {
		readonly base?: ProseMirrorDocument;
		readonly candidate: ProseMirrorDocument;
		readonly note: string;
	};

	let sides = $state<Sides | undefined>(undefined);
	let problem = $state<string | undefined>(undefined);

	$effect(() => {
		if (sides || problem) return;
		let cancelled = false;

		const load = async (): Promise<void> => {
			const { revisions } = await listNoteRevisions(noteId);
			// Newest first or oldest first is the repository's business, so order by the number
			// rather than trusting the position.
			const ordered = [...revisions].sort((left, right) => left.revision - right.revision);
			const after = revision
				? ordered.find((entry) => entry.revision === revision)
				: ordered.at(-1);
			if (!after) {
				problem = 'The version this wrote is no longer in the note history.';
				return;
			}
			const before = ordered.filter((entry) => entry.revision < after.revision).at(-1);
			// The remote takes a plain uuid string; the brand is the model's, not the wire's.
			const fetched = await Promise.all(
				[before, after]
					.filter((entry) => entry !== undefined)
					.map((entry) => getNoteRevision({ noteId, revisionId: entry.id }))
			);
			if (cancelled) return;
			const candidate = fetched.at(-1);
			if (!candidate) return;
			sides = {
				...(before ? { base: fetched[0].revision.document } : {}),
				candidate: candidate.revision.document,
				note: candidate.revision.title
			};
		};

		void load().catch(() => {
			if (!cancelled)
				problem = 'The earlier version could not be loaded, so there is nothing to compare.';
		});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if problem}
	<p class="text-xs text-muted-foreground">{problem}</p>
{:else if !sides}
	<p class="text-xs text-muted-foreground">Loading the earlier version…</p>
{:else if sides.base}
	<NoteVersionDiff
		base={sides.base}
		candidate={sides.candidate}
		baseLabel="Before"
		candidateLabel="After"
		layout="stacked"
		frame="bare"
		compact
		noteId={noteId as NoteId}
	/>
{:else}
	<!-- Nothing preceded it, so there is nothing to compare against: showing one side against
	     an empty document would mark every line as added, which says the note was written from
	     nothing when it was simply new. -->
	<div class="flex flex-col gap-1">
		<p class="text-xs text-muted-foreground">This created the note.</p>
		<NoteVersionDiff
			base={sides.candidate}
			candidate={sides.candidate}
			baseLabel="Before"
			candidateLabel="After"
			layout="candidate"
			frame="bare"
			compact
			showCounts={false}
			noteId={noteId as NoteId}
		/>
	</div>
{/if}
