<script lang="ts">
	import { noteWrite } from '$lib/models/workspace-mutations';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type {
		ConvertInlineMermaidOutput,
		DiagramSuggestion,
		DrawioDiagram,
		GenerateMermaidDiagramOutput,
		ReviseInlineMermaidOutput
	} from '$lib/models/diagrams';
	import type { ExtractPromisesOutput } from '$lib/models/todos';
	import type { FindReferencesOutput } from '$lib/models/references';
	import type { RelateSelectionOutput } from '$lib/models/relationships';
	import type {
		NoteId,
		NoteRevision,
		NoteRevisionId,
		NoteRevisionSummary,
		NoteView,
		SectionNumberingLevel,
		TextSelection
	} from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { SuggestionId } from '$lib/models/suggestions';
	import { noteEtag, sectionNumberingOverrideFor } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import { askAgent } from '$lib/client/shell/responsive-surfaces';
	import { agentActions } from '$lib/components/agent';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { noteActions } from '$lib/stores/notes/note-actions.svelte';
	import {
		noteActionRunsFor,
		type NoteActionContext
	} from '$lib/stores/notes/note-action-runs.svelte';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import type { PerNoteEditorSlot } from '../editor-context';
	import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
	import { suggestionActions } from '$lib/stores/suggestions/actions.svelte';
	import type { EditorSelectionStore } from '$lib/stores/notes/editor-selection.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import NoteOutlineRail from '../note-outline-rail.svelte';
	import type { OutlineHeading } from '$lib/models/notes';
	import { FtSuggestion as Lightbulb } from '$lib/components/icons';
	import NoteWorkspaceDialogs from './note-workspace-dialogs.svelte';
	import NoteWorkspaceHeader from './note-workspace-header.svelte';
	import {
		publishNote,
		discardNoteDraft,
		listNoteRevisions,
		getNoteRevision,
		restoreNoteRevision,
		setNoteSectionNumbering
	} from '$lib/remote/notes/notes.remote';

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
		draft: WorkspaceDraft<'notes'>;
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
	let conflictOpen = $state(false);
	let historyOpen = $state(false);
	let historyLoading = $state(false);
	let historyRevisions = $state<readonly NoteRevisionSummary[]>([]);
	let historySelectedId = $state<NoteRevisionId | undefined>(undefined);
	let historySelected = $state<NoteRevision | undefined>(undefined);
	let reviewingSuggestion = $state<DiagramSuggestion | null>(null);
	let reviewDialogOpen = $state(false);
	let editorRef = $state<NoteEditor | null>(null);
	// The note's shape, as the editor reports it. Local `$state` rather than a
	// store: the outline is derived from the document and re-emitted on every
	// remount, and this component is instantiated once per pane — so a split
	// gets two independent rails for free.
	let outline = $state<readonly OutlineHeading[]>([]);
	let activeHeading = $state<string | undefined>(undefined);
	let utilityHeaderHeight = $state(0);
	let syncReady = $state(false);
	let dirty = $state(false);
	let saveFailed = $state(false);
	// Keyed by note id rather than shared: in a split, the sibling pane's work must
	// not show up as this note's.
	const actionRuns = noteActionRunsFor(untrack(() => view.note.id));
	const activeAction = $derived(
		actionRuns.activeSelectionAction?.action as NoteAiAction | undefined
	);
	const cancellingAction = $derived(actionRuns.activeSelectionAction?.cancelling ?? false);
	let publishing = $state(false);
	let reconciling = false;
	let editVersion = 0;
	let lastSaveKeyTime = 0;
	let saveQueued = false;
	let activeSave: Promise<void> | undefined;
	// Local copy so title edits and fresh revisions survive between loads;
	// the page remounts this component per note via {#key}.
	let note = $state(untrack(() => ({ ...view.note })));
	// The numbering cascade arrives resolved from the server. A writable derived so a
	// toggle applies instantly; the server value takes over again on the next view
	// refresh, which is also how external changes (another device, or a project/app
	// default edit) arrive.
	let sectionNumbering = $derived(view.sectionNumbering);

	async function changeSectionNumbering(level: SectionNumberingLevel): Promise<void> {
		try {
			const output = await setNoteSectionNumbering({
				noteId: note.id,
				enabled: sectionNumberingOverrideFor(level)
			});
			sectionNumbering = output.sectionNumbering;
			await workspaceSession.synchronize();
			// audit-allow: silent-catch — numbering failure is reported and refreshed server state remains authoritative.
		} catch {
			toast.error('Could not update section numbering. Try again.');
		}
	}

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
		draft.status === 'pending' || draft.status === 'conflict' || draft.status === 'error'
	);

	onMount(() => {
		let cancelled = false;
		// Registered before hydrating: a run that finished while the tab was away
		// delivers its result the moment the stream reattaches.
		registerActionHandlers();
		actionRuns.hydrate();
		void draft.read().then((opened) => {
			if (opened.kind !== 'ready') {
				syncReady = true;
				return;
			}
			const local = opened.value;
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
			conflictOpen = draft.status === 'conflict';
			syncReady = true;
		});
		return () => {
			cancelled = true;
			actionRuns.detach();
		};
	});

	const pendingCount = $derived(view.pendingSuggestions.length);

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
			draft.status !== 'synced' ||
			view.note.currentRevision < note.currentRevision ||
			(view.note.currentRevision === note.currentRevision && view.note.updatedAt <= note.updatedAt)
		)
			return;
		reconciling = true;
		void draft
			.read()
			.then((opened) => {
				if (opened.kind !== 'ready') {
					syncReady = true;
					return;
				}
				const local = opened.value;
				// The document being replaced, so the editor can shimmer exactly the
				// blocks the external (agent) revision changed and leave the rest still.
				const previous = note.document;
				note = { ...local };
				editorRef?.replaceDocument(local.document, previous);
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
			const record = await draft.stage(
				noteWrite({
					...note,
					title: note.title.trim(),
					document: editorRef.getDocument(),
					plainText: editorRef.getPlainText()
				})
			);
			if (record.kind === 'failure' || !record.value) {
				saveFailed = true;
				dirty = true;
				if (!options.auto) toast.error('Could not save the note. Try again.');
				return;
			}

			saveFailed = false;
			if (savingVersion === editVersion) {
				note = { ...record.value };
				dirty = false;
			} else {
				note = {
					...note,
					currentRevision: record.value.currentRevision,
					updatedAt: record.value.updatedAt
				};
				dirty = true;
				saveQueued = true;
			}
			if (draft.status === 'conflict') {
				conflictOpen = true;
				if (!saveQueued) return;
			} else if (draft.status === 'synced') {
				await workspaceSession.synchronize();
			}
		}
	}

	async function ensureSynchronized(message: string): Promise<boolean> {
		if (dirty) await save({ auto: true });
		if (dirty || draft.status !== 'synced') {
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
		const record = await draft.stage(
			noteWrite({
				...toggled,
				document: editorRef.getDocument(),
				plainText: editorRef.getPlainText()
			})
		);
		if (record.kind === 'saved' && record.value) {
			note = { ...record.value };
			dirty = false;
			conflictOpen = draft.status === 'conflict';
			toast.success(note.isPinned ? 'Pinned' : 'Unpinned');
			if (draft.status === 'synced') await workspaceSession.synchronize();
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
		if (!(await ensureSynchronized('Sync the note before deleting it.'))) return;
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
		if (!(await ensureSynchronized('Sync the note before running an AI action.'))) return;
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
			const output = result as ExtractPromisesOutput;
			if (output.createdTodos.length > 0) {
				toast.success(`${output.createdTodos.length} todo(s) created from explicit promises`);
				await workspaceSession.synchronize();
			}
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('relate', (result) => {
			const output = result as RelateSelectionOutput;
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('reference', async (result) => {
			const output = result as FindReferencesOutput;
			if (output.outcome === 'nothing_relevant') {
				toast.info('Nothing sufficiently relevant found.');
				return;
			}
			await workspaceSession.synchronize();
			reportAdded(output.suggestions.filter((s) => s.status === 'proposed').length);
		});
		actionRuns.on('diagram', async (result, context, runId) => {
			const output = result as GenerateMermaidDiagramOutput;
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
			markDirty();
			await suggestionActions.decide(output.suggestion.id, 'accept');
			toast.success('Diagram inserted — undo with Ctrl+Z');
		});
		actionRuns.on('convert', (result) => {
			const output = result as ConvertInlineMermaidOutput;
			if (output.suggestion.kind !== 'diagram' || output.suggestion.payload.kind !== 'drawio')
				return;
			toast.success('draw.io conversion ready to review');
		});
		actionRuns.on('revise', (result, context) => {
			const output = result as ReviseInlineMermaidOutput;
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
		if (!(await ensureSynchronized('Sync the note before revising its diagram.')))
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
		return outcome.result as ReviseInlineMermaidOutput;
	}

	async function convertMermaid(source: string, instruction?: string): Promise<DiagramSuggestion> {
		if (!(await ensureSynchronized('Sync the note before converting its diagram.')))
			throw new Error('Sync the note before converting its diagram.');
		const receipt = await noteActions.convertDiagram(note.id, source, instruction);
		if (!receipt) throw new Error(noteActions.lastError ?? 'Diagram conversion failed. Try again.');
		const outcome = await actionRuns.track(receipt, { action: 'convert', context: { source } });
		if (outcome.status === 'cancelled') throw new Error('Diagram conversion cancelled.');
		if (outcome.status !== 'completed')
			throw new Error(outcome.message ?? 'Diagram conversion failed. Try again.');
		const output = outcome.result as ConvertInlineMermaidOutput;
		if (output.suggestion.kind !== 'diagram' || output.suggestion.payload.kind !== 'drawio')
			throw new Error('Diagram conversion failed. Try again.');
		return output.suggestion;
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
		await draft.retry();
		const local = draft.value;
		if (!local) {
			toast.error(draft.lastError ?? 'This resource is unavailable');
			return;
		}
		note = { ...local };
		conflictOpen = draft.status === 'conflict';
		if (draft.status === 'synced') await workspaceSession.synchronize();
		else if (draft.lastError) toast.error(draft.lastError);
	}

	async function useRemoteVersion(): Promise<void> {
		const remote = await draft.discard();
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		note = { ...remote.value };
		editorRef?.replaceDocument(remote.value.document);
		dirty = false;
		await workspaceSession.synchronize();
	}

	async function keepLocalVersion(): Promise<void> {
		await draft.keep();
		const local = draft.value;
		if (!local) throw new Error('The local edit is unavailable');
		note = { ...local };
		conflictOpen = draft.status === 'conflict';

		if (draft.status === 'synced') await workspaceSession.synchronize();
	}

	async function publish(): Promise<void> {
		if (publishing) return;
		if (dirty) await save();
		if (dirty || draft.status !== 'synced') {
			toast.error('Save the note before publishing.');
			return;
		}
		publishing = true;
		try {
			await publishNote({
				noteId: note.id,
				baseEtag: noteEtag(note)
			});
			await workspaceSession.synchronize();
			const opened = await draft.read();
			if (opened.kind !== 'ready') throw new Error('The saved note could not be reopened');
			const local = opened.value;
			note = { ...local };
			editorRef?.replaceDocument(local.document);
			toast.success('Published');
			await workspaceSession.synchronize();
			// audit-allow: silent-catch — publish failure is reported and the draft remains available.
		} catch {
			toast.error('Could not publish. Try again.');
		} finally {
			publishing = false;
		}
	}

	/**
	 * Loads the history and preselects the published snapshot, so opening it from the
	 * "Unpublished changes" hint lands directly on the draft-versus-published comparison
	 * the reader asked for. Falls back to the newest snapshot when nothing is published.
	 */
	async function openHistory(): Promise<void> {
		historyOpen = true;
		historyLoading = true;
		try {
			const { revisions } = await listNoteRevisions(note.id);
			historyRevisions = revisions;
			const preferred = revisions.find((revision) => revision.isPublished) ?? revisions.at(0);
			if (!preferred) return;
			historySelectedId = preferred.id;
			historySelected = (await getNoteRevision({ noteId: note.id, revisionId: preferred.id }))
				.revision;
			// audit-allow: silent-catch — history load failure is reported and no empty history is presented as success.
		} catch {
			toast.error('Could not load the version history. Try again.');
		} finally {
			historyLoading = false;
		}
	}

	async function selectRevision(revisionId: NoteRevisionId): Promise<void> {
		historyLoading = true;
		historySelected = undefined;
		try {
			historySelected = (await getNoteRevision({ noteId: note.id, revisionId })).revision;
			// audit-allow: silent-catch — revision load failure is reported and the current selection remains intact.
		} catch {
			toast.error('Could not load that version. Try again.');
		} finally {
			historyLoading = false;
		}
	}

	async function restoreRevision(revisionId: NoteRevisionId): Promise<void> {
		if (!(await ensureSynchronized('Sync the note before restoring a version.'))) return;
		try {
			await restoreNoteRevision({
				noteId: note.id,
				revisionId
			});
			await workspaceSession.synchronize();
			const opened = await draft.read();
			if (opened.kind !== 'ready') throw new Error('The saved note could not be reopened');
			const local = opened.value;
			note = { ...local };
			editorRef?.replaceDocument(local.document);
			dirty = false;
			toast.success('Restored that version');
			await workspaceSession.synchronize();
			// audit-allow: silent-catch — restore failure is reported and the current note remains authoritative.
		} catch {
			toast.error('Could not restore that version. Try again.');
		}
	}

	async function discardDraft(): Promise<void> {
		if (note.publishedRevision === 0) return;
		if (dirty) await save();
		if (dirty || draft.status !== 'synced') {
			toast.error('Save the note before discarding changes.');
			return;
		}
		try {
			await discardNoteDraft({ noteId: note.id });
			await workspaceSession.synchronize();
			const opened = await draft.read();
			if (opened.kind !== 'ready') throw new Error('The saved note could not be reopened');
			const local = opened.value;
			note = { ...local };
			editorRef?.replaceDocument(local.document);
			dirty = false;
			toast.success('Reverted to last published version');
			await workspaceSession.synchronize();
			// audit-allow: silent-catch — discard failure is reported and the local draft remains available.
		} catch {
			toast.error('Could not discard changes. Try again.');
		}
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
		{draft}
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
		ontitle={(title) => {
			note = { ...note, title };
			markDirty();
		}}
		onadvance={() => editorRef?.focusStart()}
		onreviewconflict={() => (conflictOpen = true)}
		onretry={() => void retrySync()}
		onpublish={() => void publish()}
		onexport={() => (exportOpen = true)}
		onask={askAboutNote}
		oncompare={askCompare}
		ontogglepin={() => void togglePin()}
		onmove={(parentId) => void moveTo(parentId)}
		onsectionnumbering={(level) => void changeSectionNumbering(level)}
		ondiscard={() => {
			if (confirm('Discard all changes since last publish?')) void discardDraft();
		}}
		onarchive={() => void archive()}
		onhistory={() => void openHistory()}
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

	{#if syncReady}
		<!-- `contents` keeps the wrapper boxless: it exists only to scope the
		     section-numbering counters to this editor, not to change layout. -->
		<div class="contents" class:note-section-numbering={sectionNumbering.effective}>
			<NoteEditor
				bind:this={editorRef}
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
						? workbench.openTabInBackground(noteId)
						: void workbench.openTab(noteId)}
				{perNote}
				onchange={markDirty}
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

	<NoteWorkspaceDialogs
		bind:exportOpen
		bind:conflictOpen
		bind:reviewDialogOpen
		bind:historyOpen
		bind:historySelectedId
		{historyRevisions}
		{historySelected}
		{historyLoading}
		{note}
		conflictRecord={draft.conflict}
		{reviewingSuggestion}
		{perNote}
		diagrams={view.diagrams}
		onUseRemote={useRemoteVersion}
		onKeepLocal={keepLocalVersion}
		onSelectRevision={(revisionId) => void selectRevision(revisionId)}
		onRestoreRevision={restoreRevision}
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
