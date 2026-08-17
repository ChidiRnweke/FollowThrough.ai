<script lang="ts">
	import type { Note, NoteSummary } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtFolder as Folder,
		FtEdit as Pencil,
		FtEllipsis as Ellipsis
	} from '$lib/components/icons';
	import NoteTitleInlineInput from './note-title-inline-input.svelte';

	let {
		shell,
		note,
		oncommit,
		onadvance
	}: {
		shell: ShellContext;
		note: Note;
		/** Called with the trimmed title once an edit commits. */
		oncommit?: (title: string) => void;
		/** Called after Enter commits, to move the caret into the document body. */
		onadvance?: () => void;
	} = $props();

	const project = $derived(shell.projects.find((candidate) => candidate.id === note.projectId));

	const folderChain = $derived.by(() => {
		const byId = new Map(shell.noteTree.map((entry) => [entry.id, entry]));
		const chain: NoteSummary[] = [];
		let parentId = note.parentId;
		let guard = 0;
		while (parentId && guard++ < 32) {
			const parent = byId.get(parentId);
			if (!parent) break;
			chain.unshift(parent);
			parentId = parent.parentId;
		}
		return chain;
	});

	// Depth must not cost header height: the header is sticky and its measured height drives
	// --note-header-h, so a wrapped crumb row pushes the editor down. The action cluster leaves the
	// crumbs room for roughly one name, so a nested note trades its project and folder crumbs for a
	// single collapsed one — same link target, whole path on hover.
	const nested = $derived(folderChain.length > 0);
	const fullPath = $derived(
		[project?.name, ...folderChain.map((folder) => folder.title)].filter(Boolean).join(' / ')
	);

	/** A note without a real title cannot be saved, so its rename affordance never hides. */
	const needsTitle = $derived(!note.title.trim() || note.title === 'Untitled');

	// Edit state is keyed by note id rather than held as a bare boolean: a pane reuses this
	// component across note navigation, so a stale `true` would leak the previous note's
	// editor onto the next one.
	let editingNoteId = $state<string | undefined>();
	let closedNoteId = $state<string | undefined>();

	// A fresh note (⌘K N lands here titled "Untitled") opens straight into editing, so the
	// command palette's focus target exists and the note is asked to name itself.
	const editing = $derived(editingNoteId === note.id || (needsTitle && closedNoteId !== note.id));

	// An untitled note starts from an empty field so the placeholder invites a real name.
	const draft = $derived(needsTitle ? '' : note.title);

	function close(): void {
		editingNoteId = undefined;
		closedNoteId = note.id;
	}

	function commit(title: string): void {
		close();
		if (title && title !== note.title) oncommit?.(title);
	}
</script>

<Breadcrumb.Root>
	<Breadcrumb.List class="flex-nowrap">
		{#if project}
			<Breadcrumb.Item class="min-w-0">
				<Tip text={fullPath} side="bottom">
					{#snippet children({ props })}
						<Breadcrumb.Link
							{...props}
							data-slot="breadcrumb-link"
							href="/projects/{project.id}"
							class="flex max-w-32 items-center gap-1 truncate"
							aria-label={nested ? fullPath : project.name}
						>
							{#if nested}
								<Folder class="size-3 shrink-0" />
								<Ellipsis class="size-4 shrink-0" />
							{:else}
								{project.name}
							{/if}
						</Breadcrumb.Link>
					{/snippet}
				</Tip>
			</Breadcrumb.Item>
			<Breadcrumb.Separator class="shrink-0" />
		{/if}
		<!-- min-w-12 below keeps the title from being squeezed to nothing by the crumb above it. -->
		<Breadcrumb.Item class="group/crumb min-w-0">
			{#if editing}
				<NoteTitleInlineInput initialValue={draft} onsubmit={commit} oncancel={close} {onadvance} />
			{:else}
				<!-- The crumb truncates at 12rem, so a long title is only readable on hover. -->
				<Tip text={note.title} side="bottom" delayDuration={700}>
					{#snippet children({ props })}
						<Breadcrumb.Page {...props} class="max-w-48 min-w-12 truncate"
							>{note.title}</Breadcrumb.Page
						>
					{/snippet}
				</Tip>
				<Tip text="Rename note">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-xs"
							class="size-11 shrink-0 transition-opacity sm:size-6 {needsTitle
								? ''
								: 'sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/crumb:opacity-100'}"
							aria-label="Rename note"
							onclick={() => (editingNoteId = note.id)}
						>
							<Pencil />
						</Button>
					{/snippet}
				</Tip>
			{/if}
		</Breadcrumb.Item>
	</Breadcrumb.List>
</Breadcrumb.Root>
