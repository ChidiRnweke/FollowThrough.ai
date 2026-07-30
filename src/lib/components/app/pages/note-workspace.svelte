<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type {
		DiagramSuggestion,
		DrawioDiagram,
		NoteId,
		NoteView,
		ShellContext,
		SuggestionId,
		TextSelection,
		VersionedNote
	} from '$lib/models';
	import { noteEtag } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		FtEllipsis as Ellipsis,
		FtLoader as LoaderCircle,
		FtPin as Pin,
		FtPinOff as PinOff
	} from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { askAgent } from '$lib/client/responsive-surfaces';
	import { workbench } from '$lib/stores/workbench.svelte';
	import AgentAction from '../agent/agent-action.svelte';
	import { agentActions } from '../agent/agent-actions';
	import { noteActions } from '$lib/stores/note-actions.svelte';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { suggestionToView } from '$lib/stores/suggestion-view';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import type { NoteSyncStore } from '$lib/stores/note-sync.svelte';
	import type { NoteTodosStore } from '$lib/stores/note-todos.svelte';
	import type { SuggestionTrayStore } from '$lib/stores/suggestion-tray.svelte';
	import type { EditorSelectionStore } from '$lib/stores/editor-selection.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import NoteBreadcrumb from '../note-breadcrumb.svelte';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import NoteConflictDialog from '../note-conflict-dialog.svelte';
	import NoteSyncStatus from '../note-sync-status.svelte';
	import {
		FtExport as FileOutput,
		FtPublish as ArrowUpFromLine,
		FtUndo as Undo2,
		FtSuggestion as Lightbulb,
		FtSuggestion as Suggestion,
		FtDocument as FileText,
		FtClose as X
	} from '$lib/components/icons';
	import ExportDialog from '../export-dialog.svelte';
	import DrawioReviewDialog from '../drawio-review-dialog.svelte';
	import { publishNote, discardNoteDraft } from '$lib/remote/notes.remote';

	let {
		view,
		shell,
		noteSync,
		noteTodos,
		suggestionTray,
		editorSelection,
		inlineSuggestionsEnabled = true,
		onCloseSplit
	}: {
		view: NoteView;
		shell: ShellContext;
		noteSync: NoteSyncStore;
		noteTodos: NoteTodosStore;
		suggestionTray: SuggestionTrayStore;
		editorSelection: EditorSelectionStore;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	// `perNote` is built once from the registry-backed store props supplied by
	// the owning `WorkspacePane`.  Each registry returns a stable instance for
	// a given `noteId`, so this capture is intentional and does not need to
	// track prop identity changes that will never happen.
	const perNote: PerNoteEditorSlot = untrack(() => ({
		todos: noteTodos,
		suggestions: suggestionTray,
		selection: editorSelection,
		sync: noteSync
	}));

	let exportOpen = $state(false);
	let conflictOpen = $state(false);
	let reviewingSuggestion = $state<DiagramSuggestion | null>(null);
	let reviewDialogOpen = $state(false);
	let editorRef = $state<NoteEditor | null>(null);
	let syncReady = $state(false);
	let dirty = $state(false);
	let saveFailed = $state(false);
	let publishing = $state(false);
	let reconciling = false;
	let editVersion = 0;
	let lastSaveKeyTime = 0;
	let saveQueued = false;
	let activeSave: Promise<void> | undefined;
	// Local copy so title edits and fresh revisions survive between loads;
	// the page remounts this component per note via {#key}.
	let note = $state(untrack(() => ({ ...view.note })));

	/**
	 * Notes offerable as `@` link targets. Scoped to this note's project because a
	 * relationship across projects is rejected by the service, and excluding this note
	 * keeps a note from linking to itself.
	 */
	const linkableNotes = $derived(
		shell.noteTree
			.filter(
				(entry) =>
					entry.projectId === note.projectId &&
					entry.kind !== 'folder' &&
					!entry.archivedAt &&
					entry.id !== note.id
			)
			.map((entry) => ({ id: entry.id, title: entry.title }))
	);

	const hasUnpublishedChanges = $derived(note.currentRevision > note.publishedRevision);
	// Any state where the device copy has not reached the server.  These must win
	// over the "unpublished changes" hint in the header, otherwise the retry and
	// "Review conflict" controls stay hidden for exactly the notes that need them.
	const unsynced = $derived(
		noteSync.status === 'pending' || noteSync.status === 'conflict' || noteSync.status === 'error'
	);

	onMount(() => {
		let cancelled = false;
		const stopListening = noteSync.listenForReconnect();
		void noteSync.initialize({ note: view.note, etag: view.etag }).then((local) => {
			if (cancelled) return;
			// Use view.note as the base for all server-authoritative fields
			// (parentId, position, publishedRevision, publishedAt, etc.) and
			// only take content fields from the local sync record.  The
			// coordinator's IndexedDB record may carry stale metadata when
			// operations like move or publish changed the note without bumping
			// currentRevision.
			note = {
				...view.note,
				title: local.title,
				document: local.document,
				plainText: local.plainText,
				isPinned: local.isPinned,
				currentRevision: local.currentRevision,
				updatedAt: local.updatedAt
			};
			conflictOpen = noteSync.status === 'conflict';
			syncReady = true;
		});
		return () => {
			cancelled = true;
			stopListening();
			noteSync.reset();
		};
	});

	const noteRef = $derived({ id: note.id, title: note.title });
	const pendingCount = $derived(
		suggestionTray.items.filter(
			(item) => item.suggestion.noteId === note.id && item.suggestion.status === 'proposed'
		).length
	);

	const folders = $derived(
		shell.noteTree.filter(
			(entry) => entry.projectId === note.projectId && entry.kind === 'folder' && !entry.archivedAt
		)
	);

	// Pick up external revisions (e.g. AI-created todo nodes) through the same
	// reconciliation path as a future service-worker-driven refresh.
	$effect(() => {
		void view.etag;
		if (
			!syncReady ||
			dirty ||
			reconciling ||
			noteSync.status !== 'synced' ||
			view.note.currentRevision < note.currentRevision ||
			(view.note.currentRevision === note.currentRevision && view.note.updatedAt <= note.updatedAt)
		)
			return;
		reconciling = true;
		void noteSync
			.initialize({ note: view.note, etag: view.etag })
			.then((local) => {
				note = { ...local };
				editorRef?.replaceDocument(local.document);
			})
			.finally(() => {
				reconciling = false;
			});
	});

	// Pick up parentId/position changes from sidebar reorders, which update the
	// database without bumping currentRevision and therefore bypass the revision-
	// gated reconciliation effect above.
	$effect(() => {
		const viewParentId = view.note.parentId;
		const viewPosition = view.note.position;
		if (untrack(() => note.parentId !== viewParentId || note.position !== viewPosition)) {
			note = { ...note, parentId: viewParentId, position: viewPosition };
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

	$effect(() => {
		const requested = suggestionTray.reviewRequested;
		if (requested) {
			reviewingSuggestion = requested;
			reviewDialogOpen = true;
			suggestionTray.clearReview();
		}
	});

	$effect(() => {
		if (!reviewDialogOpen && reviewingSuggestion) {
			reviewingSuggestion = null;
		}
	});

	const AUTOSAVE_DELAY = 2000;
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

	function markDirty(): void {
		editVersion += 1;
		dirty = true;
		saveFailed = false;
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => void save({ auto: true }), AUTOSAVE_DELAY);
	}

	$effect(() => () => clearTimeout(autosaveTimer));

	function save(options: { auto?: boolean } = {}): Promise<void> {
		if (!editorRef) return Promise.resolve();
		if (!dirty) {
			// Content already staged on the device but not on the server: there is
			// nothing to mark dirty, so a manual save has to mean "flush what is
			// stuck" rather than silently doing nothing.
			if (!options.auto && unsynced) return retrySync();
			return Promise.resolve();
		}
		if (!note.title.trim()) {
			if (!options.auto) toast.error('Give the note a title first.');
			return Promise.resolve();
		}
		clearTimeout(autosaveTimer);
		saveQueued = true;
		activeSave ??= flushSaves(options).finally(() => {
			activeSave = undefined;
		});
		return activeSave;
	}

	async function flushSaves(options: { auto?: boolean }): Promise<void> {
		while (saveQueued && editorRef) {
			saveQueued = false;
			const savingVersion = editVersion;
			const record = await noteSync.save({
				...note,
				title: note.title.trim(),
				document: editorRef.getDocument(),
				plainText: editorRef.getPlainText()
			});
			if (!record) {
				saveFailed = true;
				dirty = true;
				if (!options.auto) toast.error('Could not save the note. Try again.');
				return;
			}

			saveFailed = false;
			if (savingVersion === editVersion) {
				note = { ...record.local };
				dirty = false;
			} else {
				note = {
					...note,
					currentRevision: record.local.currentRevision,
					updatedAt: record.local.updatedAt
				};
				dirty = true;
				saveQueued = true;
			}
			if (record.state === 'conflict') {
				conflictOpen = true;
				if (!saveQueued) return;
			} else if (record.state === 'synced') {
				await invalidateAll();
			}
		}
	}

	async function ensureSynchronized(message: string): Promise<boolean> {
		if (dirty) await save({ auto: true });
		if (dirty || noteSync.status !== 'synced') {
			toast.error(message);
			return false;
		}
		return true;
	}

	async function togglePin(): Promise<void> {
		if (!editorRef) return;
		if (dirty) {
			await save({ auto: true });
			if (dirty) return;
		}
		const toggled = { ...note, isPinned: !note.isPinned };
		const record = await noteSync.save({
			...toggled,
			document: editorRef.getDocument(),
			plainText: editorRef.getPlainText()
		});
		if (record) {
			note = { ...record.local };
			dirty = false;
			conflictOpen = record.state === 'conflict';
			toast.success(note.isPinned ? 'Pinned' : 'Unpinned');
			if (record.state === 'synced') await invalidateAll();
		} else {
			toast.error('Could not update pin. Try again.');
		}
	}

	async function moveTo(parentId?: NoteId): Promise<void> {
		if ((note.parentId ?? undefined) === parentId) return;
		if (!(await ensureSynchronized('Sync the note before moving it.'))) return;
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
		if (!(await ensureSynchronized('Sync the note before archiving it.'))) return;
		const output = await projectActions.archiveNote(note.id);
		if (!output) {
			toast.error('Could not archive the note. Try again.');
			return;
		}
		await goto(`/projects/${note.projectId}`);
	}

	async function runAction(
		action: NoteAiAction,
		capturedSelection?: TextSelection,
		insertAt?: number
	): Promise<void> {
		let selection = capturedSelection;
		if (!selection || noteActions.running) {
			if (!selection) toast.error('Select some text first.');
			return;
		}
		if (!(await ensureSynchronized('Sync the note before running an AI action.'))) return;
		selection = { ...selection, revision: note.currentRevision };
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
			await invalidateAll();
		} else {
			// Capture the insertion point before the request; the selection may
			// change or clear while the diagram is generated.
			if (insertAt === undefined) {
				toast.error('Select some text first.');
				return;
			}
			const output = await noteActions.generateDiagram(selection);
			if (!output) {
				toast.error(noteActions.lastError ?? 'Diagram generation failed. Try again.');
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

	async function reviseMermaid(
		source: string,
		instruction: string
	): Promise<{ readonly source: string; readonly title?: string }> {
		if (!(await ensureSynchronized('Sync the note before revising its diagram.')))
			throw new Error('Sync the note before revising its diagram.');
		const output = await noteActions.reviseDiagram(note.id, source, instruction);
		if (!output) throw new Error(noteActions.lastError ?? 'Diagram revision failed. Try again.');
		toast.success('Diagram revised — undo with Ctrl+Z');
		return output;
	}

	async function convertMermaid(source: string, instruction?: string): Promise<DiagramSuggestion> {
		if (!(await ensureSynchronized('Sync the note before converting its diagram.')))
			throw new Error('Sync the note before converting its diagram.');
		const output = await noteActions.convertDiagram(note.id, source, instruction);
		if (
			!output ||
			output.suggestion.kind !== 'diagram' ||
			output.suggestion.payload.kind !== 'drawio'
		)
			throw new Error(noteActions.lastError ?? 'Diagram conversion failed. Try again.');
		const suggestion = output.suggestion;
		suggestionTray.add([suggestionToView(suggestion, 'agent', noteRef)]);
		toast.success('draw.io conversion ready to review');
		return suggestion;
	}

	async function acceptDrawio(
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	): Promise<DrawioDiagram> {
		if (!(await ensureSynchronized('Sync the note before accepting its diagram.')))
			throw new Error('Sync the note before accepting its diagram.');
		const diagram = await noteActions.acceptDrawio(note.id, suggestionId, source, renderedSvg);
		if (!diagram) throw new Error(noteActions.lastError ?? 'The diagram could not be accepted.');
		suggestionTray.remove(suggestionId);
		await invalidateAll();
		toast.success('draw.io diagram accepted');
		return diagram;
	}

	async function rejectDrawio(suggestionId: SuggestionId): Promise<void> {
		const rejected = await noteActions.rejectDrawio(suggestionId);
		if (!rejected)
			throw new Error(noteActions.lastError ?? 'The conversion could not be dismissed.');
		suggestionTray.remove(suggestionId);
		toast.success('draw.io conversion dismissed');
	}

	function runSkill(skillName: string): void {
		askSelection(`Use the "${skillName}" skill on the selected text`, [skillName]);
	}

	// Only the primary pane offers it, so a split does not show the same question
	// twice; `onCloseSplit` is supplied to the split pane alone.
	const comparable = $derived(workbench.splitNoteId !== undefined && !onCloseSplit);

	function askAboutNote(): void {
		askAgent({
			prompt: agentActions.note.prompt,
			noteId: note.id,
			projectId: view.note.projectId
		});
	}

	function askCompare(): void {
		askAgent({
			prompt: agentActions.noteCompare.prompt,
			noteId: note.id,
			projectId: view.note.projectId
		});
	}

	/** Every selection-scoped prompt goes through here, so they all carry the same context. */
	function askSelection(prompt: string, skills?: readonly string[]): void {
		const selection = editorSelection.current;
		if (!selection) {
			toast.error('Select some text first.');
			return;
		}
		askAgent({
			prompt,
			selection,
			noteId: selection.noteId,
			projectId: view.note.projectId,
			...(skills ? { requestedSkillNames: skills } : {})
		});
	}

	function onkeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key === 's') {
			event.preventDefault();
			const now = Date.now();
			if (now - lastSaveKeyTime < 800 && hasUnpublishedChanges) {
				lastSaveKeyTime = 0;
				void publish();
			} else {
				lastSaveKeyTime = now;
				void save();
			}
		}
	}

	function onbeforeunload(event: BeforeUnloadEvent): void {
		if (dirty) event.preventDefault();
	}

	async function retrySync(): Promise<void> {
		const record = await noteSync.retry();
		if (!record) {
			toast.error(
				noteSync.lastError ?? 'Could not reach the note on this device. Reload the page.'
			);
			return;
		}
		note = { ...record.local };
		conflictOpen = record.state === 'conflict';
		if (record.state === 'synced') {
			await invalidateAll();
			return;
		}
		if (record.state === 'pending')
			toast.error(noteSync.lastError ?? 'Still could not sync. Check your connection.');
	}

	async function useRemoteVersion(): Promise<void> {
		const remote = await noteSync.useRemote();
		if (!remote) return;
		note = { ...remote };
		editorRef?.replaceDocument(remote.document);
		dirty = false;
		await invalidateAll();
	}

	async function keepLocalVersion(): Promise<void> {
		const record = await noteSync.keepLocal();
		if (!record) return;
		note = { ...record.local };
		conflictOpen = record.state === 'conflict';
		if (record.state === 'synced') await invalidateAll();
	}

	async function publish(): Promise<void> {
		if (publishing) return;
		if (dirty) await save();
		if (dirty || noteSync.status !== 'synced') {
			toast.error('Save the note before publishing.');
			return;
		}
		publishing = true;
		try {
			const result = await publishNote({
				noteId: note.id,
				baseEtag: noteEtag(note)
			});
			const output = result as VersionedNote;
			const local = await noteSync.initialize(output);
			note = { ...local };
			editorRef?.replaceDocument(local.document);
			toast.success('Published');
			await invalidateAll();
		} catch {
			toast.error('Could not publish. Try again.');
		} finally {
			publishing = false;
		}
	}

	async function discardDraft(): Promise<void> {
		if (note.publishedRevision === 0) return;
		if (dirty) await save();
		if (dirty || noteSync.status !== 'synced') {
			toast.error('Save the note before discarding changes.');
			return;
		}
		try {
			const result = await discardNoteDraft({ noteId: note.id });
			const output = result as VersionedNote;
			const local = await noteSync.initialize(output);
			note = { ...local };
			editorRef?.replaceDocument(local.document);
			dirty = false;
			toast.success('Reverted to last published version');
			await invalidateAll();
		} catch {
			toast.error('Could not discard changes. Try again.');
		}
	}
</script>

<svelte:window {onkeydown} {onbeforeunload} />

{#snippet syncStatus()}
	<div class="min-w-0 flex-1 sm:flex-none">
		<NoteSyncStatus
			status={noteSync.status}
			updatedAt={note.updatedAt}
			reason={noteSync.lastError}
			onRetry={() => void retrySync()}
			onReview={() => (conflictOpen = true)}
		/>
	</div>
{/snippet}

<div class="note-measure mx-auto flex w-full min-w-0 flex-1 flex-col gap-4">
	<!-- Sticks to the top of the pane's own scroller so save status and note actions stay
	     reachable in a long note. Kept quiet per the document pattern: an opaque pane
	     background and one hairline, no shadow — the flat-surface rule still holds. Each
	     pane scrolls independently, so in a split the two headers stick independently too.

	     No vertical margin or top padding: the pane layer's own `padding-block` sits outside
	     the scroll viewport, so `top-0` already lands where the row used to. Only `pb-2` is
	     added, to keep the hairline off the first line of the document. -->
	<div
		class="sticky top-0 z-20 flex min-w-0 flex-col gap-2 border-b border-border bg-background pb-2 sm:min-h-8 sm:flex-row sm:items-center dark:bg-card"
		data-testid="note-utility-header"
	>
		<div class="flex min-w-0 items-center gap-1 sm:flex-1">
			<div class="min-w-0 flex-1">
				<NoteBreadcrumb
					{shell}
					{note}
					oncommit={(title) => {
						note = { ...note, title };
						markDirty();
					}}
					onadvance={() => editorRef?.focusStart()}
				/>
			</div>
			{#if onCloseSplit}
				<Tip text="Close split view">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="size-11 sm:size-8"
							aria-label="Close split view"
							onclick={onCloseSplit}
						>
							<X />
						</Button>
					{/snippet}
				</Tip>
			{/if}
		</div>
		<div class="flex min-w-0 items-center gap-1 sm:ml-auto sm:gap-2">
			{#if noteActions.running}
				<LoaderCircle
					class="size-4 animate-spin text-muted-foreground"
					aria-label="AI action running"
				/>
			{/if}
			{#if dirty && !note.title.trim()}
				<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
					>Add a title to save</span
				>
			{:else if saveFailed}
				<Tip text={noteSync.lastError ?? 'The note could not be saved. Your text is still here.'}>
					{#snippet children({ props })}
						<span
							{...props}
							class="min-w-0 flex-1 text-xs text-destructive sm:flex-none"
							aria-live="polite"
						>
							Couldn’t save · press Ctrl+S to retry
						</span>
					{/snippet}
				</Tip>
				<!-- A stuck sync outranks both hints below it: those are only ever
				     informational, while this is the note's one route back to saved. -->
			{:else if unsynced || noteSync.status === 'saving'}
				{@render syncStatus()}
			{:else if dirty}
				<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
					>Unsaved changes</span
				>
			{:else if hasUnpublishedChanges}
				<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
					>Unpublished changes</span
				>
			{:else}
				{@render syncStatus()}
			{/if}
			<!--
				Labelled from `lg` up, and folded into the overflow menu below it — the
				same trade the Export control in this header already makes, because a
				note header that wraps costs more than a word of discoverability.
			-->
			<AgentAction
				action={agentActions.note}
				context={{ noteId: note.id, projectId: view.note.projectId }}
				class="hidden lg:inline-flex"
			/>
			<!-- Both carry a keyboard shortcut and Export is icon-only, so the label
			     is the only place either fact is stated. -->
			<Tip text="Publish note (Ctrl+S)">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="outline"
						size="sm"
						class="h-11 sm:h-8"
						disabled={!hasUnpublishedChanges || dirty || publishing}
						aria-label="Publish note (Ctrl+S, S)"
						onclick={() => void publish()}
					>
						{#if publishing}
							<LoaderCircle class="size-4 animate-spin" />
						{:else}
							<ArrowUpFromLine class="size-4" />
						{/if}
						Publish
					</Button>
				{/snippet}
			</Tip>
			<Tip text="Export document">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="hidden sm:inline-flex"
						aria-label="Export document"
						onclick={() => (exportOpen = true)}
					>
						<FileOutput class="size-4" />
					</Button>
				{/snippet}
			</Tip>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props: menuProps })}
						<Tip text="Note actions">
							{#snippet children({ props: tipProps })}
								<Button
									{...mergeProps(menuProps, tipProps)}
									variant="ghost"
									size="icon-sm"
									class="size-11 sm:size-8"
									aria-label="Note actions"
								>
									<Ellipsis />
								</Button>
							{/snippet}
						</Tip>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item class="lg:hidden" onclick={() => askAboutNote()}>
						<Suggestion data-icon="inline-start" />
						{agentActions.note.label}
					</DropdownMenu.Item>
					{#if comparable}
						<!-- Two notes side by side is the one question this screen can ask
						     that no other screen can, so it appears only when it applies. -->
						<DropdownMenu.Item onclick={() => askCompare()}>
							<FileText data-icon="inline-start" />
							{agentActions.noteCompare.label}
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Separator class={comparable ? '' : 'lg:hidden'} />
					<DropdownMenu.Item class="sm:hidden" onclick={() => (exportOpen = true)}>
						<FileOutput data-icon="inline-start" />
						Export document
					</DropdownMenu.Item>
					<DropdownMenu.Separator class="sm:hidden" />
					<DropdownMenu.Group>
						<DropdownMenu.Item onclick={togglePin}>
							{#if note.isPinned}
								<PinOff data-icon="inline-start" />
								Unpin
							{:else}
								<Pin data-icon="inline-start" />
								Pin to sidebar
							{/if}
						</DropdownMenu.Item>
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>Move to</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent>
								<DropdownMenu.Group>
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
								</DropdownMenu.Group>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.Group>
						<DropdownMenu.Item
							disabled={note.publishedRevision === 0 || !hasUnpublishedChanges}
							onclick={() => {
								if (confirm('Discard all changes since last publish?')) void discardDraft();
							}}
						>
							<Undo2 data-icon="inline-start" />
							Discard changes
						</DropdownMenu.Item>
						<DropdownMenu.Item variant="destructive" onclick={() => void archive()}>
							Archive note
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#if view.backlinks.length > 0 || pendingCount > 0}
		<div class="flex flex-wrap items-center gap-1.5">
			{#each view.backlinks as backlink (backlink.relationship.id)}
				<BacklinkChip {backlink} direction={backlink.sourceNote.id === note.id ? 'out' : 'in'} />
			{/each}
			{#if pendingCount > 0}
				<Button size="xs" variant="outline" onclick={() => rightPanel.openSuggestions()}>
					<Lightbulb class="size-3.5" />
					{pendingCount} suggestion{pendingCount === 1 ? '' : 's'}
				</Button>
			{/if}
		</div>
	{/if}

	{#if syncReady}
		<NoteEditor
			bind:this={editorRef}
			noteId={note.id}
			revision={note.currentRevision}
			{inlineSuggestionsEnabled}
			document={note.document}
			references={view.references}
			diagrams={view.diagrams}
			skills={shell.skills}
			{linkableNotes}
			onOpenNote={(noteId, options) =>
				options.background ? workbench.openTabInBackground(noteId) : void workbench.openTab(noteId)}
			{perNote}
			onchange={markDirty}
			onaction={(action, selection, insertAt) => void runAction(action, selection, insertAt)}
			onskill={runSkill}
			onask={(prompt) => askSelection(prompt)}
			onreviseMermaid={reviseMermaid}
			onconvertMermaid={convertMermaid}
			onacceptDrawio={acceptDrawio}
			onrejectDrawio={rejectDrawio}
		/>
	{:else}
		<!-- Match the editor's eventual footprint (full viewport height minus the
		     72px header row above) so IndexedDB init time doesn't cause
		     vertical reflow between the short-skeleton and the hydrated editor. -->
		<div class="flex min-h-96 flex-col gap-3" aria-label="Loading note from device">
			<Skeleton class="h-5 w-full" />
			<Skeleton class="h-5 w-11/12" />
			<Skeleton class="h-5 w-4/5" />
			<Skeleton class="mt-2 h-5 w-full" />
			<Skeleton class="h-5 w-5/6" />
			<Skeleton class="h-5 w-3/4" />
			<Skeleton class="h-5 w-2/3" />
		</div>
	{/if}

	{#if noteSync.record?.state === 'conflict'}
		<NoteConflictDialog
			bind:open={conflictOpen}
			record={noteSync.record}
			onUseRemote={useRemoteVersion}
			onKeepLocal={keepLocalVersion}
		/>
	{/if}

	<ExportDialog
		bind:open={exportOpen}
		projectId={note.projectId}
		defaultTitle={note.title}
		defaultNoteIds={[note.id]}
		documents={[{ id: note.id, document: note.document }]}
	/>

	{#if reviewingSuggestion}
		<DrawioReviewDialog
			bind:open={reviewDialogOpen}
			suggestion={reviewingSuggestion}
			onaccept={async (output) => {
				const suggestion = reviewingSuggestion;
				if (!suggestion) return;
				await acceptDrawio(suggestion.id, output.xml, output.svg);
				reviewingSuggestion = null;
				reviewDialogOpen = false;
			}}
		/>
	{/if}
</div>
