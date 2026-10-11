<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { onMount, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Separator } from '$lib/components/ui/separator';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import SkillEditor from '../skill-editor.svelte';
	import { NoteConflictDialog, NoteSyncStatus, NoteTitleInlineInput } from '$lib/components/notes';
	import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
	import { createEditorSession } from '$lib/factories/workspace/editor-session';
	import { importSkillMarkdown } from '$lib/remote/skills/skills.remote';
	import type { EditorSave } from '$lib/models/outbox';
	import type { Note } from '$lib/models/notes';
	import {
		FtDownload as Download,
		FtEdit as Pencil,
		FtExport as FileOutput,
		FtLoader as LoaderCircle
	} from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import WorkspaceWriteReview from '$lib/components/shared/workspace-write-review.svelte';
	import type { WorkspaceSkill } from '$lib/models/workspace-views';
	let { skill }: { skill: WorkspaceSkill } = $props();
	let describeRef: SkillEditor | undefined = $state();
	let bodyRef: SkillEditor | undefined = $state();
	const AUTOSAVE_DELAY = 2000;
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before mounting an editor');
	// The skill is two resources: its instructions are a note, its description is skill metadata.
	const draft = untrack(() => session.resources.draft({ type: 'notes', id: [skill.note.id] }));
	const metadata = untrack(() => session.resources.draft({ type: 'skills', id: [skill.note.id] }));
	const edits = untrack(() =>
		createEditorSession(() => workspaceSession.current === session && draft.active)
	);
	draft.adopt();
	metadata.adopt();
	let note = $state<Note>(untrack(() => skill.note));
	let savedDescription = $state(untrack(() => skill.description));
	let editorEpoch = $state(0);
	let importing = $state(false);
	let exporting = $state(false);
	let closed = false;
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
	const noteId = $derived(note.id);
	const dirty = $derived(edits.dirty);
	const saving = $derived(edits.saving);
	const saveFailed = $derived(edits.failure !== null);
	const unsynced = $derived([draft.status, metadata.status].some((status) => status !== 'synced'));
	const status = $derived.by(() => {
		const drafts = [draft, metadata];
		const selected =
			drafts.find((item) => item.status === 'conflict') ??
			drafts.find((item) => item.status === 'error') ??
			drafts.find((item) => item.status !== 'synced') ??
			draft;
		return {
			kind: selected === metadata ? ('metadata' as const) : ('document' as const),
			value: selected.status,
			error: selected.lastError
		};
	});
	let conflictOpen = $state(untrack(() => draft.conflict !== undefined));
	let metadataReview = $state(false);
	let editingTitle = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	const active = () =>
		!closed &&
		workspaceSession.current === session &&
		session.resources.active &&
		draft.active &&
		metadata.active;
	onMount(() => () => {
		clearTimeout(autosaveTimer);
		closed = true;
		edits.close();
	});
	$effect(() => {
		if (draft.conflict) conflictOpen = true;
	});
	function markDirty(): void {
		if (!active()) return;
		edits.changed();
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => void save({ auto: true }), AUTOSAVE_DELAY);
	}
	/** Store the description, then the instructions; both are queued on this device first. */
	async function persist(): Promise<EditorSave<Note>> {
		if (!bodyRef || !describeRef) return { kind: 'failure', message: 'The editor is unavailable' };
		const details = metadata.value;
		if (!details)
			return { kind: 'failure', message: 'The skill details are unavailable. Reopen the skill.' };
		const description = describeRef.getMarkdown().trim();
		const current = note;
		if (description !== savedDescription) {
			const result = await metadata.stage({
				kind: 'updateSkill',
				noteId: details.noteId,
				description
			});
			if (!active()) return { kind: 'failure', message: 'The skill editor is no longer active' };
			if (result.kind === 'failure') return result;
			if (!result.value) return { kind: 'failure', message: 'The skill no longer exists' };
			savedDescription = result.value.description;
		}
		const result = await draft.stage({
			kind: 'saveNote',
			noteId: current.id,
			title: current.title,
			isPinned: current.isPinned,
			document: bodyRef.getDocument(),
			plainText: bodyRef.getMarkdown()
		});
		if (result.kind === 'failure') return result;
		return result.value
			? { kind: 'saved', value: result.value }
			: { kind: 'failure', message: 'The skill no longer exists' };
	}
	async function save(options: { readonly auto?: boolean } = {}): Promise<void> {
		if (!active() || !bodyRef || !describeRef) return;
		if (!dirty) {
			if (!options.auto && unsynced) await retrySync();
			return;
		}
		clearTimeout(autosaveTimer);
		await edits.save(persist, (value, unchanged) => {
			if (!active()) return;
			note = unchanged
				? { ...value }
				: { ...note, currentRevision: value.currentRevision, updatedAt: value.updatedAt };
		});
		if (active() && edits.failure && !options.auto) toast.error(edits.failure);
	}
	async function retrySync(): Promise<void> {
		if (!active()) return;
		const current = edits.checkpoint();
		await Promise.all([draft.retry(), metadata.retry()]);
		if (!active()) return;
		const local = draft.value;
		if (!local) {
			toast.error(draft.lastError ?? 'This resource is unavailable');
			return;
		}
		if (current() && !edits.dirty) note = { ...local };
		if (draft.lastError) toast.error(draft.lastError);
	}
	async function useRemoteVersion(): Promise<void> {
		if (!active()) return;
		const remote = await draft.discard(edits.checkpoint());
		if (!active() || remote.kind === 'superseded') return;
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		note = { ...remote.value };
		editorEpoch += 1;
		edits.accept();
	}
	async function keepLocalVersion(): Promise<void> {
		if (!active()) return;
		const current = edits.checkpoint();
		await draft.keep();
		if (!active() || !current() || edits.dirty) return;
		const local = draft.value;
		if (!local) throw new Error('The local edit is unavailable');
		note = { ...local };
		editorEpoch += 1;
	}
	/** A file operation reads the server's copy, so every edit must be sent first. */
	async function synchronized(message: string): Promise<boolean> {
		if (edits.dirty) await save({ auto: true });
		if (!active()) return false;
		if (edits.dirty || unsynced) {
			toast.error(message);
			return false;
		}
		return true;
	}
	async function exportSkill(): Promise<void> {
		if (!active() || exporting) return;
		exporting = true;
		try {
			if (!(await synchronized('Save the skill before exporting.'))) return;
			const sync = await workspaceSession.synchronize();
			if (!active() || sync.kind === 'stopped') return;
			if (sync.kind === 'failure') return void toast.error(sync.message);
			const file = workspaceViews.skillFile(note.id, note.plainText);
			if (file.kind === 'failure') return void toast.error(file.message);
			download(file.content, file.filename);
		} finally {
			exporting = false;
		}
	}
	function download(content: string, filename: string): void {
		const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
		const anchor = document.createElement('a');
		try {
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
		} finally {
			anchor.remove();
			URL.revokeObjectURL(url);
		}
	}
	async function importSkill(file: File): Promise<void> {
		if (!active()) return;
		importing = true;
		try {
			if (!(await synchronized('Save and synchronize the skill before importing.'))) return;
			const current = edits.checkpoint();
			const raw = await file.text();
			if (!active()) return;
			if (!current()) return void toast.error('Save the latest edits before importing.');
			const imported = await workspaceSession.serverChange(
				importSkillMarkdown({ noteId: note.id, raw, baseRevision: note.currentRevision })
			);
			if (!active()) return;
			if (imported.kind === 'failure') return void toast.error(imported.message);
			const [opened, details] = await Promise.all([draft.read(current), metadata.read(current)]);
			if (!active()) return;
			if (opened.kind === 'superseded' || details.kind === 'superseded')
				return void toast.info('The import completed. Your later edits are retained for review.');
			if (opened.kind !== 'ready' || details.kind !== 'ready')
				return void toast.error('The imported skill could not be reopened');
			note = { ...opened.value };
			savedDescription = details.value.description;
			editorEpoch += 1;
			edits.accept();
			toast.success('Skill imported');
		} finally {
			importing = false;
		}
	}
	function commitTitle(title: string): void {
		editingTitle = false;
		if (!active() || !title || title === note.title) return;
		note = { ...note, title };
		markDirty();
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

{#snippet syncStatus()}
	<div class="min-w-0 flex-1 sm:flex-none">
		<NoteSyncStatus
			status={saving ? 'saving' : status.value}
			updatedAt={note.updatedAt}
			reason={status.error}
			onRetry={() => void retrySync()}
			onReview={() => {
				if (status.kind === 'metadata') metadataReview = true;
				else conflictOpen = true;
			}}
		/>
	</div>
{/snippet}

<WorkspaceWriteReview resources={session.resources} bind:open={metadataReview} />
<div class="flex w-full min-w-0 flex-1 flex-col px-4 pt-6 pb-6 md:px-8">
	<div class="note-measure mx-auto flex w-full min-w-0 flex-1 flex-col gap-4">
		<div
			class="flex min-w-0 flex-col gap-2 sm:min-h-8 sm:flex-row sm:items-center"
			data-testid="note-utility-header"
		>
			<div class="group/title flex min-w-0 items-center gap-1 sm:flex-1">
				<div class="flex min-w-0 flex-1 items-center">
					{#if editingTitle}
						<NoteTitleInlineInput
							initialValue={note.title}
							onsubmit={commitTitle}
							oncancel={() => (editingTitle = false)}
							onadvance={() => describeRef?.focus()}
						/>
					{:else}
						<h1 class="page-title truncate">{note.title}</h1>
						<Tip text="Rename skill">
							{#snippet children({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-xs"
									class="size-11 shrink-0 transition-opacity sm:size-6 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/title:opacity-100"
									aria-label="Rename skill"
									onclick={() => (editingTitle = true)}
								>
									<Pencil />
								</Button>
							{/snippet}
						</Tip>
					{/if}
				</div>
			</div>
			<div class="flex min-w-0 items-center gap-1 sm:ml-auto sm:gap-2">
				{#if saveFailed}
					<Tip text={edits.failure ?? 'The skill could not be saved. Your text is still here.'}>
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
					<!-- A stuck sync outranks the hint below it: it is the skill's one route
				     back to saved. -->
				{:else if unsynced || status.value === 'saving'}
					{@render syncStatus()}
				{:else if dirty}
					<span class="min-w-0 flex-1 text-xs text-muted-foreground sm:flex-none" aria-live="polite"
						>Unsaved changes</span
					>
				{:else}
					{@render syncStatus()}
				{/if}
				<AgentAction
					action={agentActions.skillDetail}
					context={{ noteId: note.id }}
					class="hidden lg:inline-flex"
				/>
				<Tip text="Import SKILL.md">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							disabled={importing}
							aria-label="Import SKILL.md"
							onclick={() => fileInput?.click()}
						>
							{#if importing}
								<LoaderCircle class="size-4 animate-spin" />
							{:else}
								<Download class="size-4" />
							{/if}
						</Button>
					{/snippet}
				</Tip>
				<Tip text="Export as SKILL.md">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							disabled={exporting}
							aria-label="Export as SKILL.md"
							onclick={() => void exportSkill()}
						>
							{#if exporting}
								<LoaderCircle class="size-4 animate-spin" />
							{:else}
								<FileOutput class="size-4" />
							{/if}
						</Button>
					{/snippet}
				</Tip>
				<Input
					bind:ref={fileInput}
					type="file"
					accept=".md,text/markdown"
					class="sr-only"
					onchange={(event) => {
						const file = event.currentTarget.files?.[0];
						if (file) void importSkill(file);
						event.currentTarget.value = '';
					}}
				/>
			</div>
		</div>

		{#key `${noteId}:${editorEpoch}`}
			<div class="flex flex-1 flex-col">
				<section class="flex flex-col p-4 md:p-6">
					<div class="flex flex-col gap-1">
						<h2 class="section-title">Describe your skill</h2>
						<p class="text-sm text-muted-foreground">
							When should your agent trigger it? This is what the agent reads to decide when to load
							this skill.
						</p>
					</div>
					<div class="mt-6 flex flex-col">
						<SkillEditor
							bind:this={describeRef}
							compact
							ariaLabel="Skill description"
							initialMarkdown={savedDescription}
							onchange={markDirty}
						/>
					</div>
				</section>
				<Separator />
				<section class="flex flex-1 flex-col p-4 md:p-6">
					<div class="flex flex-col gap-1">
						<h2 class="section-title">What should the agent do?</h2>
						<p class="text-sm text-muted-foreground">
							Markdown instructions the agent follows when this skill loads.
						</p>
					</div>
					<div class="mt-6 flex flex-1 flex-col">
						<SkillEditor
							bind:this={bodyRef}
							ariaLabel="Skill instructions"
							initialMarkdown={note.plainText}
							onchange={markDirty}
						/>
					</div>
				</section>
			</div>
		{/key}
	</div>
</div>

{#if draft.conflict}
	<NoteConflictDialog
		bind:open={conflictOpen}
		record={draft.conflict}
		onUseRemote={useRemoteVersion}
		onKeepLocal={keepLocalVersion}
	/>
{/if}
