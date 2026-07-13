<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { NoteId, NoteView, ShellContext } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import { toast } from 'svelte-sonner';
	import { chat } from '$lib/stores/chat.svelte';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { noteActions } from '$lib/stores/note-actions.svelte';
	import { noteTodos } from '$lib/stores/note-todos.svelte';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { suggestionToView } from '$lib/stores/suggestion-view';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import ReferenceCard from '../reference-card.svelte';
	import { formatRelativeTime } from '../labels';

	let { view, shell }: { view: NoteView; shell: ShellContext } = $props();

	let editorRef = $state<NoteEditor | null>(null);
	let dirty = $state(false);
	// Local copy so title edits and fresh revisions survive between loads;
	// the page remounts this component per note via {#key}.
	let note = $state(untrack(() => ({ ...view.note })));

	const noteRef = $derived({ id: note.id, title: note.title });
	const pendingCount = $derived(
		suggestionTray.items.filter(
			(item) => item.suggestion.noteId === note.id && item.suggestion.status === 'proposed'
		).length
	);

	function scrollToFirstSuggestion(): void {
		window.document
			.querySelector('.suggestion-inline-widget-host')
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
	const folders = $derived(
		shell.noteTree.filter(
			(entry) => entry.projectId === note.projectId && entry.kind === 'folder' && !entry.archivedAt
		)
	);

	// Pick up external revisions (e.g. AI-created todo nodes) when we have no
	// local edits in flight.
	$effect(() => {
		if (!dirty && !noteActions.saving && view.note.currentRevision > note.currentRevision) {
			note = { ...view.note };
		}
	});

	$effect(() => {
		noteTodos.replace(view.todos);
		suggestionTray.replace(view.pendingSuggestions);
		return () => {
			noteTodos.clear();
			editorSelection.clear();
		};
	});

	const AUTOSAVE_DELAY = 2000;
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

	function markDirty(): void {
		dirty = true;
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => void save({ auto: true }), AUTOSAVE_DELAY);
	}

	$effect(() => () => clearTimeout(autosaveTimer));

	async function save(options: { auto?: boolean } = {}): Promise<void> {
		if (!editorRef || noteActions.saving) return;
		if (!note.title.trim()) {
			if (!options.auto) toast.error('Give the note a title first.');
			return;
		}
		clearTimeout(autosaveTimer);
		const output = await noteActions.save({
			...note,
			title: note.title.trim(),
			document: editorRef.getDocument()
		});
		if (output) {
			note = { ...output.note };
			dirty = false;
			await invalidateAll();
		} else if (!options.auto) {
			toast.error('Could not save the note. Reload if the problem persists.');
		}
	}

	async function togglePin(): Promise<void> {
		const toggled = { ...note, isPinned: !note.isPinned };
		const output = await noteActions.save(toggled);
		if (output) {
			note = { ...output.note };
			toast.success(output.note.isPinned ? 'Pinned' : 'Unpinned');
			await invalidateAll();
		} else {
			toast.error('Could not update pin. Try again.');
		}
	}

	async function moveTo(parentId?: NoteId): Promise<void> {
		if ((note.parentId ?? undefined) === parentId) return;
		if (dirty) await save({ auto: true });
		const siblings = shell.noteTree.filter(
			(entry) =>
				entry.projectId === note.projectId &&
				(entry.parentId ?? undefined) === parentId &&
				!entry.archivedAt
		);
		const output = await projectActions.moveEntry(
			note.projectId,
			note.id,
			parentId,
			siblings.length
		);
		if (!output) toast.error('Could not move the note. Try again.');
		else note = { ...note, parentId: output.entry.parentId, position: output.entry.position };
	}

	async function archive(): Promise<void> {
		const output = await projectActions.archiveNote(note.id);
		if (!output) {
			toast.error('Could not archive the note. Try again.');
			return;
		}
		await goto(`/projects/${note.projectId}`);
	}

	async function runAction(action: NoteAiAction): Promise<void> {
		const selection = editorSelection.current;
		if (!selection || noteActions.running) {
			if (!selection) toast.error('Select some text first.');
			return;
		}
		let added: number;
		if (action === 'promises') {
			const output = await noteActions.extractPromises(selection);
			if (!output) {
				toast.error('Extract Promises failed. Try again.');
				return;
			}
			suggestionTray.add(
				output.suggestions.map((s) => suggestionToView(s, 'extract_promises', noteRef))
			);
			added = output.suggestions.filter((s) => s.status === 'proposed').length;
			if (output.createdTodos.length > 0) {
				toast.success(`${output.createdTodos.length} todo(s) created from explicit promises`);
				await invalidateAll();
			}
		} else if (action === 'relate') {
			const output = await noteActions.relate(selection);
			if (!output) {
				toast.error('Relate failed. Try again.');
				return;
			}
			suggestionTray.add(output.suggestions.map((s) => suggestionToView(s, 'relate', noteRef)));
			added = output.suggestions.filter((s) => s.status === 'proposed').length;
		} else if (action === 'reference') {
			const output = await noteActions.findReferences(selection);
			if (!output) {
				toast.error('Reference failed. Try again.');
				return;
			}
			if (output.outcome === 'nothing_relevant') {
				toast.info('Nothing sufficiently relevant found.');
				return;
			}
			suggestionTray.add(output.suggestions.map((s) => suggestionToView(s, 'reference', noteRef)));
			added = output.suggestions.filter((s) => s.status === 'proposed').length;
		} else {
			// Capture the insertion point before the request; the selection may
			// change or clear while the diagram is generated.
			const insertAt = selection.to;
			const output = await noteActions.generateDiagram(selection);
			if (!output) {
				toast.error('Diagram generation failed. Try again.');
				return;
			}
			if (output.suggestion.kind === 'diagram') {
				editorRef?.insertMermaid(insertAt, output.suggestion.payload.source);
				markDirty();
				const view = suggestionToView(output.suggestion, 'agent', noteRef);
				suggestionTray.add([view]);
				await suggestionTray.decide(view.suggestion.id, 'accept');
				toast.success('Diagram inserted — undo with Ctrl+Z');
			}
			return;
		}
		if (added > 0) {
			toast.success(
				`${added} suggestion${added === 1 ? '' : 's'} added — accept or dismiss ${added === 1 ? 'it' : 'them'} in the note`
			);
		} else {
			toast.info('No suggestions found.');
		}
	}

	function runSkill(skillName: string): void {
		const selection = editorSelection.current;
		if (!selection) {
			toast.error('Select some text first.');
			return;
		}
		rightPanel.openChat();
		void chat.send({
			prompt: `Use the "${skillName}" skill on the selected text.`,
			selection,
			noteId: selection.noteId,
			requestedSkillNames: [skillName]
		});
	}

	function onkeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key === 's') {
			event.preventDefault();
			void save();
		}
	}

	function onbeforeunload(event: BeforeUnloadEvent): void {
		if (dirty) event.preventDefault();
	}
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<div class="mx-auto flex min-h-0 w-full max-w-[75ch] flex-1 flex-col gap-2">
	<div class="flex flex-wrap items-center gap-1.5">
		{#each view.backlinks as backlink (backlink.relationship.id)}
			<BacklinkChip {backlink} direction={backlink.sourceNote.id === note.id ? 'out' : 'in'} />
		{/each}
		<span class="text-xs text-muted-foreground select-none">Select text for AI actions</span>
		{#if pendingCount > 0}
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-success transition-colors hover:bg-success/20"
				title="Suggestions without a text anchor live in the Suggestions inbox"
				onclick={scrollToFirstSuggestion}
			>
				{pendingCount} suggestion{pendingCount === 1 ? '' : 's'} to accept or dismiss
			</button>
		{/if}
		<div class="ml-auto flex items-center gap-2">
			{#if noteActions.running}
				<LoaderCircle class="size-4 animate-spin text-muted-foreground" />
			{/if}
			<span class="text-xs text-muted-foreground" aria-live="polite">
				{#if noteActions.saving}
					Saving…
				{:else if dirty}
					Unsaved changes
				{:else}
					Saved · {formatRelativeTime(note.updatedAt)}
				{/if}
			</span>
			<Button
				size="sm"
				variant={dirty ? 'default' : 'outline'}
				disabled={noteActions.saving}
				onclick={() => void save()}
			>
				Save
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-sm" aria-label="Note actions">
							<Ellipsis class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={togglePin}>
						{#if note.isPinned}
							<PinOff class="mr-2 size-4" />
							Unpin
						{:else}
							<Pin class="mr-2 size-4" />
							Pin to sidebar
						{/if}
					</DropdownMenu.Item>
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>Move to</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							<DropdownMenu.Item
								disabled={note.parentId === undefined}
								onclick={() => void moveTo(undefined)}
							>
								Project root
							</DropdownMenu.Item>
							{#each folders as folder (folder.id)}
								<DropdownMenu.Item
									disabled={folder.id === note.parentId}
									onclick={() => void moveTo(folder.id)}
								>
									{folder.title}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onclick={() => void archive()}>
						Archive note
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<input
		class="mt-2 w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
		placeholder="Untitled"
		aria-label="Note title"
		bind:value={note.title}
		oninput={markDirty}
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === 'ArrowDown') {
				event.preventDefault();
				editorRef?.focusStart();
			}
		}}
	/>

	<NoteEditor
		bind:this={editorRef}
		noteId={note.id}
		revision={note.currentRevision}
		document={note.document}
		skills={shell.skills}
		onchange={markDirty}
		onaction={(action) => void runAction(action)}
		onskill={runSkill}
	/>

	{#if view.references.length > 0}
		<Separator />
		<div class="grid gap-3 lg:grid-cols-2">
			{#each view.references as reference (reference.id)}
				<ReferenceCard {reference} />
			{/each}
		</div>
	{/if}
</div>
