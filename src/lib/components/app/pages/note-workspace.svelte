<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { NoteId, NoteView, ShellContext, TextSelection } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import { toast } from 'svelte-sonner';
	import { chat } from '$lib/stores/chat.svelte';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import { noteActions } from '$lib/stores/note-actions.svelte';
	import { noteSync } from '$lib/stores/note-sync.svelte';
	import { noteTodos } from '$lib/stores/note-todos.svelte';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { suggestionToView } from '$lib/stores/suggestion-view';
	import { suggestionTray } from '$lib/stores/suggestion-tray.svelte';
	import BacklinkChip from '../backlink-chip.svelte';
	import NoteBreadcrumb from '../note-breadcrumb.svelte';
	import NoteEditor, { type NoteAiAction } from '../note-editor.svelte';
	import NoteConflictDialog from '../note-conflict-dialog.svelte';
	import NoteSyncStatus from '../note-sync-status.svelte';
	import NoteTitleInput from '../note-title-input.svelte';
	import FileOutput from '@lucide/svelte/icons/file-output';
	import ExportDialog from '../export-dialog.svelte';

	let { view, shell }: { view: NoteView; shell: ShellContext } = $props();

	let exportOpen = $state(false);
	let conflictOpen = $state(false);
	let editorRef = $state<NoteEditor | null>(null);
	let syncReady = $state(false);
	let dirty = $state(false);
	let saveFailed = $state(false);
	let reconciling = false;
	let editVersion = 0;
	let saveQueued = false;
	let activeSave: Promise<void> | undefined;
	// Local copy so title edits and fresh revisions survive between loads;
	// the page remounts this component per note via {#key}.
	let note = $state(untrack(() => ({ ...view.note })));

	onMount(() => {
		let cancelled = false;
		const stopListening = noteSync.listenForReconnect();
		void noteSync.initialize({ note: view.note, etag: view.etag }).then((local) => {
			if (cancelled) return;
			note = { ...local };
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

	// Pick up external revisions (e.g. AI-created todo nodes) through the same
	// reconciliation path as a future service-worker-driven refresh.
	$effect(() => {
		void view.etag;
		if (
			!syncReady ||
			dirty ||
			reconciling ||
			noteSync.status !== 'synced' ||
			view.note.currentRevision <= note.currentRevision
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
		editVersion += 1;
		dirty = true;
		saveFailed = false;
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => void save({ auto: true }), AUTOSAVE_DELAY);
	}

	$effect(() => () => clearTimeout(autosaveTimer));

	function save(options: { auto?: boolean } = {}): Promise<void> {
		if (!editorRef) return Promise.resolve();
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

	async function retrySync(): Promise<void> {
		const record = await noteSync.retry();
		if (!record) return;
		note = { ...record.local };
		conflictOpen = record.state === 'conflict';
		if (record.state === 'synced') await invalidateAll();
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
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<div class="note-measure mx-auto flex min-h-full w-full flex-1 flex-col gap-4">
	<div class="flex min-h-8 flex-wrap items-center gap-2">
		<div class="min-w-0 flex-1">
			<NoteBreadcrumb {shell} {note} />
		</div>
		<div class="ml-auto flex items-center gap-2">
			{#if noteActions.running}
				<LoaderCircle
					class="size-4 animate-spin text-muted-foreground"
					aria-label="AI action running"
				/>
			{/if}
			{#if dirty && !note.title.trim()}
				<span class="text-xs text-muted-foreground" aria-live="polite">Add a title to save</span>
			{:else if saveFailed}
				<span class="text-xs text-destructive" aria-live="polite">
					Couldn’t save · press Ctrl+S to retry
				</span>
			{:else if dirty}
				<span class="text-xs text-muted-foreground" aria-live="polite">Unsaved changes</span>
			{:else}
				<NoteSyncStatus
					status={noteSync.status}
					updatedAt={note.updatedAt}
					onRetry={() => void retrySync()}
					onReview={() => (conflictOpen = true)}
				/>
			{/if}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Export document"
				onclick={() => (exportOpen = true)}
			>
				<FileOutput class="size-4" />
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon-sm" aria-label="Note actions">
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
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
						<DropdownMenu.Item variant="destructive" onclick={() => void archive()}>
							Archive note
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<NoteTitleInput
		bind:value={note.title}
		oninput={markDirty}
		onadvance={() => editorRef?.focusStart()}
	/>

	{#if view.backlinks.length > 0 || pendingCount > 0}
		<div class="flex flex-wrap items-center gap-1.5">
			{#each view.backlinks as backlink (backlink.relationship.id)}
				<BacklinkChip {backlink} direction={backlink.sourceNote.id === note.id ? 'out' : 'in'} />
			{/each}
			{#if pendingCount > 0}
				<Button
					size="xs"
					variant="outline"
					title="Suggestions without a text anchor live in the Suggestions inbox"
					onclick={scrollToFirstSuggestion}
				>
					{pendingCount} suggestion{pendingCount === 1 ? '' : 's'} to review
				</Button>
			{/if}
		</div>
	{/if}

	{#if syncReady}
		<NoteEditor
			bind:this={editorRef}
			noteId={note.id}
			revision={note.currentRevision}
			document={note.document}
			references={view.references}
			skills={shell.skills}
			onchange={markDirty}
			onaction={(action, selection, insertAt) => void runAction(action, selection, insertAt)}
			onskill={runSkill}
			onreviseMermaid={reviseMermaid}
		/>
	{:else}
		<div class="flex flex-1 flex-col gap-3" aria-label="Loading note from device">
			<Skeleton class="h-5 w-full" />
			<Skeleton class="h-5 w-5/6" />
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
</div>
