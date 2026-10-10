<script lang="ts">
	import { createNoteHistory } from '$lib/factories/notes/history';
	import type { DiagramSuggestion } from '$lib/models/suggestions';

	import type { ShellContext } from '$lib/models/workspace-views';

	import type { NoteView } from '$lib/models/workspace-views';

	import { workspaceSession } from '$lib/factories/workspace/session';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { DrawioDiagram } from '$lib/models/diagrams';
	import type { NoteId, TextSelection } from '$lib/models/notes';

	import type { SuggestionId } from '$lib/models/suggestions';
	import { createNoteWorkspace } from '$lib/factories/notes/workspace';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { chatHandoff } from '$lib/factories/agent/chat-handoff';
	import { agentActions } from '$lib/components/agent';
	import { workbench, workbenchNavigation } from '$lib/factories/workbench/workbench';
	import { noteActions } from '$lib/factories/notes/actions';
	import { noteActionTracking } from '$lib/factories/notes/action-runs';
	import type { NoteActionContext } from '$lib/models/agent';
	import { projectActions } from '$lib/factories/projects/actions';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import type { PerNoteEditorSlot } from '../editor-context';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
	import { suggestionActions } from '$lib/stores/suggestions/actions.svelte';
	import type { EditorSelectionStore } from '$lib/stores/notes/editor-selection.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import type { NoteEditorOperations } from '$lib/controllers/notes/editor-operations';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import NoteOutlineRail from '../note-outline-rail.svelte';
	import type { OutlineHeading } from '$lib/models/notes';
	import { FtSuggestion as Lightbulb } from '$lib/components/icons';
	import NoteWorkspaceDialogs from './note-workspace-dialogs.svelte';
	import NoteWorkspaceHeader from './note-workspace-header.svelte';

	let {
		view,
		shell,
		draft,
		editorSelection,
		inlineSuggestionsEnabled = true,
		onCloseSplit
	}: {
		view: NoteView;
		shell: ShellContext;
		draft: WorkspaceDraftController<'notes'>;
		editorSelection: EditorSelectionStore;
		inlineSuggestionsEnabled?: boolean;
		onCloseSplit?: () => void;
	} = $props();

	const perNote: PerNoteEditorSlot = {
		get suggestions() {
			return view.pendingSuggestions;
		},
		selection: untrack(() => editorSelection)
	};

	let exportOpen = $state(false);
	let historyOpen = $state(false);
	const history = untrack(() => createNoteHistory(view.note.id));
	$effect(() => {
		if (!historyOpen) history.cancel();
	});
	let reviewingSuggestion = $state<DiagramSuggestion | null>(null);
	let reviewDialogOpen = $state(false);
	let editorRef = $state<NoteEditorOperations>();
	// The note's shape, as the editor reports it. Local `$state` rather than a
	// store: the outline is derived from the document and re-emitted on every
	// remount, and this component is instantiated once per pane — so a split
	// gets two independent rails for free.
	let outline = $state<readonly OutlineHeading[]>([]);
	let activeHeading = $state<string | undefined>(undefined);
	let utilityHeaderHeight = $state(0);
	const actionRuns = noteActionTracking.open(untrack(() => view.note.id));
	const activeAction = $derived(
		actionRuns.activeSelectionAction?.action as NoteAiAction | undefined
	);
	const cancellingAction = $derived(actionRuns.activeSelectionAction?.cancelling ?? false);
	let lastSaveKeyTime = 0;
	let conflictOpen = $state(false);
	const workspace = untrack(() =>
		createNoteWorkspace(
			view.note.id,
			draft,
			() => editorRef,
			(open) => {
				conflictOpen = open;
			}
		)
	);
	untrack(() => workspace.open());
	const note = $derived(workspace.note);
	const dirty = $derived(workspace.dirty);
	const saveFailed = $derived(workspace.saveFailed);
	const publishing = $derived(workspace.publishing);
	const sectionNumbering = $derived(view.sectionNumbering);

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

	const hasUnpublishedChanges = $derived(workspace.hasUnpublishedChanges);
	const unsynced = $derived(workspace.unsynced);

	onMount(() => {
		// Registered before hydrating: a run that finished while the tab was away
		// delivers its result the moment the stream reattaches.
		registerActionHandlers();
		actionRuns.hydrate();
		return () => {
			workspace.close();
			history.cancel();
			actionRuns.detach();
		};
	});

	const pendingCount = $derived(view.pendingSuggestions.length);

	const folders = $derived(
		shell.noteTree.filter(
			(entry) => entry.projectId === note.projectId && entry.kind === 'folder' && !entry.archivedAt
		)
	);

	// Reconcile this pane without replacing a dirty editor or its undo history.
	$effect(() => {
		const observed = view.note;
		if (!dirty && workspace.sync.status === 'synced')
			untrack(() => workspace.reconcileSaved(observed));
	});
	$effect(() => {
		const { parentId, position } = view.note;
		untrack(() => workspace.placementChanged(parentId, position));
	});

	$effect(() => {
		return () => {
			editorSelection.clear();
		};
	});

	$effect(() => {
		const requested = view.pendingSuggestions.find(
			(item) => item.suggestion.id === suggestionActions.reviewRequested
		)?.suggestion;
		if (requested?.kind === 'diagram') {
			reviewingSuggestion = requested;
			reviewDialogOpen = true;
			suggestionActions.clearReview();
		}
	});

	$effect(() => {
		if (!reviewDialogOpen && reviewingSuggestion) {
			reviewingSuggestion = null;
		}
	});

	async function moveTo(parentId?: NoteId): Promise<void> {
		if ((note.parentId ?? undefined) === parentId) return;
		if (!(await workspace.ensureSynchronized('Sync the note before moving it.'))) return;
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
		else workspace.placementChanged(output.entry.parentId, output.entry.position);
	}

	async function archive(): Promise<void> {
		if (dirty) await workspace.save({ auto: true });
		if (dirty || workspace.sync.status === 'error' || workspace.sync.status === 'conflict') {
			toast.error('Save or resolve the note before moving it to trash.');
			return;
		}
		const output = await projectActions.archiveNote(note.id);
		if (!output) {
			toast.error('Could not delete the note. Try again.');
			return;
		}
		toast.success('Moved to trash');
		await goto(`/projects/${note.projectId}`);
	}

	async function runAction(
		action: NoteAiAction,
		capturedSelection?: TextSelection,
		insertAt?: number
	): Promise<void> {
		if (!capturedSelection || activeAction) {
			if (!capturedSelection) toast.error('Select some text first.');
			return;
		}
		if (action === 'diagram' && insertAt === undefined) {
			toast.error('Select some text first.');
			return;
		}
		if (!(await workspace.ensureSynchronized('Sync the note before running an AI action.'))) return;
		const selection = { ...capturedSelection, revision: note.currentRevision };
		const receipt =
			action === 'promises'
				? await noteActions.extractPromises(selection)
				: action === 'relate'
					? await noteActions.relate(selection)
					: action === 'reference'
						? await noteActions.findReferences(selection)
						: await noteActions.generateDiagram(selection);
		if (!receipt) {
			toast.error(noteActions.lastError ?? 'The action could not be started. Try again.');
			return;
		}
		// The insertion point is captured now: the selection may move or clear
		// while the diagram is generated, and a refresh loses it entirely. The
		// editor holds it and maps it through every edit the author makes in
		// between, so the node lands where the text is when the run settles.
		if (action === 'diagram' && insertAt !== undefined) {
			editorRef?.holdInsertionPoint(receipt.runId, insertAt);
		}
		const outcome = await actionRuns.track(receipt, {
			action,
			...(insertAt === undefined ? {} : { context: { insertAt } })
		});
		if (outcome.status === 'failed')
			toast.error(outcome.message ?? 'The action failed. Try again.');
	}

	/**
	 * What to do with each action's result, registered once rather than written at
	 * the call site: after a refresh the call site is gone, and the replayed result
	 * still has to land in the same place.
	 */
	function registerActionHandlers(): void {
		actionRuns.on('promises', async (result) => {
			if (result.action !== 'promises') throw new Error('Unexpected note action result');
			const output = result.output;
			if (output.createdTodos.length > 0) {
				toast.success(`${output.createdTodos.length} todo(s) created from explicit promises`);
				await workspaceSession.synchronize();
			}
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('relate', (result) => {
			if (result.action !== 'relate') throw new Error('Unexpected note action result');
			const output = result.output;
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('reference', async (result) => {
			if (result.action !== 'reference') throw new Error('Unexpected note action result');
			const output = result.output;
			if (output.outcome === 'nothing_relevant') {
				toast.info('Nothing sufficiently relevant found.');
				return;
			}
			await workspaceSession.synchronize();
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('diagram', async (result, context, runId) => {
			if (result.action !== 'diagram') throw new Error('Unexpected note action result');
			const output = result.output;
			if (output.suggestion.kind !== 'diagram') return;
			const live = editorRef?.consumeInsertionPoint(runId);
			// The live mapped point wins; a refresh leaves no plugin state behind, so
			// fall back to the persisted one, which the editor kept current as the
			// author typed. 'lost' means the location was deleted while the run flew.
			const insertAt = live === 'lost' ? undefined : (live ?? insertionPoint(context));
			if (
				insertAt === undefined ||
				!editorRef?.insertMermaid(insertAt, output.suggestion.payload.source)
			) {
				toast.error(
					'The diagram is ready, but its place in the note was lost. Copy it from the suggestion tray.'
				);
				return;
			}
			workspace.changed();
			await suggestionActions.decide(output.suggestion.id, 'accept');
			toast.success('Diagram inserted — undo with Ctrl+Z');
		});
		actionRuns.on('convert', (result) => {
			if (result.action !== 'convert') throw new Error('Unexpected note action result');
			const output = result.output;
			if (output.suggestion.kind !== 'diagram' || output.suggestion.payload.kind !== 'drawio')
				return;
			toast.success('draw.io conversion ready to review');
		});
		actionRuns.on('revise', (result, context) => {
			if (result.action !== 'revise') throw new Error('Unexpected note action result');
			const output = result.output;
			const previous = typeof context.source === 'string' ? context.source : undefined;
			// On the live path the Mermaid node view applies this itself from the
			// promise; this branch is the one a refresh leaves behind.
			if (previous && editorRef?.replaceMermaid(previous, output.source))
				toast.success('Diagram revised — undo with Ctrl+Z');
		});
	}

	const insertionPoint = (context: NoteActionContext): number | undefined =>
		typeof context.insertAt === 'number' ? context.insertAt : undefined;

	function reportAdded(added: number): void {
		if (added > 0)
			toast.success(
				`${added} suggestion${added === 1 ? '' : 's'} added — accept or dismiss ${added === 1 ? 'it' : 'them'} in the note`
			);
		else toast.info('No suggestions found.');
	}

	async function reviseMermaid(
		source: string,
		instruction: string,
		renderedPngDataUrl?: string
	): Promise<{ readonly source: string; readonly title?: string }> {
		if (!(await workspace.ensureSynchronized('Sync the note before revising its diagram.')))
			throw new Error('Sync the note before revising its diagram.');
		const receipt = await noteActions.reviseDiagram(
			note.id,
			source,
			instruction,
			renderedPngDataUrl
		);
		if (!receipt) throw new Error(noteActions.lastError ?? 'Diagram revision failed. Try again.');
		// `source` travels as context so a refresh can still find the node this
		// revision belongs to and apply it there.
		const outcome = await actionRuns.track(receipt, { action: 'revise', context: { source } });
		if (outcome.status === 'cancelled') throw new Error('Diagram revision cancelled.');
		if (outcome.status !== 'completed')
			throw new Error(outcome.message ?? 'Diagram revision failed. Try again.');
		toast.success('Diagram revised — undo with Ctrl+Z');
		if (outcome.result.action !== 'revise') throw new Error('Unexpected diagram revision result');
		return outcome.result.output;
	}

	async function convertMermaid(source: string, instruction?: string): Promise<DiagramSuggestion> {
		if (!(await workspace.ensureSynchronized('Sync the note before converting its diagram.')))
			throw new Error('Sync the note before converting its diagram.');
		const receipt = await noteActions.convertDiagram(note.id, source, instruction);
		if (!receipt) throw new Error(noteActions.lastError ?? 'Diagram conversion failed. Try again.');
		const outcome = await actionRuns.track(receipt, { action: 'convert', context: { source } });
		if (outcome.status === 'cancelled') throw new Error('Diagram conversion cancelled.');
		if (outcome.status !== 'completed')
			throw new Error(outcome.message ?? 'Diagram conversion failed. Try again.');
		if (outcome.result.action !== 'convert')
			throw new Error('Unexpected diagram conversion result');
		const output = outcome.result.output;
		if (output.suggestion.kind !== 'diagram' || output.suggestion.payload.kind !== 'drawio')
			throw new Error('Diagram conversion failed. Try again.');
		return output.suggestion;
	}

	async function acceptDrawio(
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	): Promise<DrawioDiagram> {
		if (!(await workspace.ensureSynchronized('Sync the note before accepting its diagram.')))
			throw new Error('Sync the note before accepting its diagram.');
		const diagram = await noteActions.acceptDrawio(note.id, suggestionId, source, renderedSvg);
		if (!diagram) throw new Error(noteActions.lastError ?? 'The diagram could not be accepted.');
		await workspaceSession.synchronize();
		toast.success('draw.io diagram accepted');
		return diagram;
	}

	async function rejectDrawio(suggestionId: SuggestionId): Promise<void> {
		const rejected = await noteActions.rejectDrawio(suggestionId);
		if (!rejected)
			throw new Error(noteActions.lastError ?? 'The conversion could not be dismissed.');
		await workspaceSession.synchronize();
		toast.success('draw.io conversion dismissed');
	}

	function runSkill(skillName: string): void {
		askSelection(`Use the "${skillName}" skill on the selected text`, [skillName]);
	}

	// Only the primary pane offers it, so a split does not show the same question
	// twice; `onCloseSplit` is supplied to the split pane alone.
	const comparable = $derived(workbench.splitNoteId !== undefined && !onCloseSplit);

	function askAboutNote(): void {
		chatHandoff.ask({
			prompt: agentActions.note.prompt,
			noteId: note.id,
			projectId: view.note.projectId
		});
	}

	function askCompare(): void {
		chatHandoff.ask({
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
		chatHandoff.ask({
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
				void workspace.publish();
			} else {
				lastSaveKeyTime = now;
				void workspace.save();
			}
		}
	}

	function onbeforeunload(event: BeforeUnloadEvent): void {
		if (dirty) event.preventDefault();
	}
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<div
	class="note-measure @container relative mx-auto flex w-full min-w-0 flex-1 flex-col gap-4"
	style:--note-header-h="{utilityHeaderHeight}px"
>
	<NoteOutlineRail
		headings={outline}
		activeId={activeHeading}
		numbered={view.sectionNumbering.effective}
		onpick={(id) => editorRef?.scrollToHeading(id)}
	/>
	<NoteWorkspaceHeader
		{shell}
		{note}
		projectId={view.note.projectId}
		draft={workspace.sync}
		{dirty}
		{saveFailed}
		{unsynced}
		{hasUnpublishedChanges}
		{activeAction}
		{publishing}
		{comparable}
		{folders}
		{sectionNumbering}
		{onCloseSplit}
		bind:height={utilityHeaderHeight}
		ontitle={(title) => workspace.titleChanged(title)}
		onadvance={() => editorRef?.focusStart()}
		onreviewconflict={() => (conflictOpen = true)}
		onretry={() => void workspace.retrySync()}
		onpublish={() => void workspace.publish()}
		onexport={() => (exportOpen = true)}
		onask={askAboutNote}
		oncompare={askCompare}
		ontogglepin={() => void workspace.togglePin()}
		onmove={(parentId) => void moveTo(parentId)}
		onsectionnumbering={(level) => void workspace.numbering(level)}
		ondiscard={() => {
			if (confirm('Discard all changes since last publish?')) void workspace.discardDraft();
		}}
		onarchive={() => void archive()}
		onhistory={() => {
			historyOpen = true;
			void history.open();
		}}
	/>

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

	<!-- `contents` keeps the wrapper boxless: it exists only to scope the
		     section-numbering counters to this editor, not to change layout. -->
	<div class="contents" class:note-section-numbering={sectionNumbering.effective}>
		<NoteEditor
			onready={(operations) => (editorRef = operations)}
			noteId={note.id}
			projectId={note.projectId}
			revision={note.currentRevision}
			{inlineSuggestionsEnabled}
			document={note.document}
			references={view.references}
			diagrams={view.diagrams}
			skills={shell.skills}
			{linkableNotes}
			onOpenNote={(noteId, options) =>
				options.background
					? workbenchNavigation.openTabInBackground(noteId)
					: void workbenchNavigation.openTab(noteId)}
			{perNote}
			onchange={() => workspace.changed()}
			onoutline={(headings) => (outline = headings)}
			onactiveheading={(id) => (activeHeading = id)}
			{activeAction}
			actionCancelling={cancellingAction}
			onInsertionPointMoved={(runId, position) =>
				actionRuns.updateContext(runId, { insertAt: position })}
			oncancelaction={() => {
				const run = actionRuns.activeSelectionAction;
				if (run) void actionRuns.cancel(run.runId);
			}}
			oncancelmermaid={(kind) => {
				const run = actionRuns.find(kind);
				if (run) void actionRuns.cancel(run.runId);
			}}
			onaction={(action, selection, insertAt) => void runAction(action, selection, insertAt)}
			onskill={runSkill}
			onask={(prompt) => askSelection(prompt)}
			onreviseMermaid={reviseMermaid}
			onconvertMermaid={convertMermaid}
			onrejectDrawio={rejectDrawio}
		/>
	</div>

	<NoteWorkspaceDialogs
		bind:exportOpen
		bind:conflictOpen
		bind:reviewDialogOpen
		bind:historyOpen
		historySelectedId={history.selectedId}
		historyRevisions={history.revisions}
		historySelected={history.selected}
		historyReadState={history.readState}
		{note}
		conflictRecord={workspace.sync.conflict}
		{reviewingSuggestion}
		{perNote}
		diagrams={view.diagrams}
		onUseRemote={() => workspace.useRemoteVersion()}
		onKeepLocal={() => workspace.keepLocalVersion()}
		onSelectRevision={(revisionId) => void history.select(revisionId)}
		onRestoreRevision={(id) => workspace.restoreRevision(id)}
		onAcceptDrawio={async (output) => {
			const suggestion = reviewingSuggestion;
			if (!suggestion) return;
			const diagram = await acceptDrawio(suggestion.id, output.xml, output.svg);
			editorRef?.completeDrawioConversion(suggestion.id, diagram.id);
			reviewingSuggestion = null;
			reviewDialogOpen = false;
		}}
	/>
</div>
