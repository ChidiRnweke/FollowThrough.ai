<script lang="ts">
	import { EditorSession } from '$lib/stores/workspace/editor-session.svelte';
	import { noteCommand } from '$lib/models/workspace-mutations';
	import { Input } from '$lib/components/ui/input';
	import { onMount, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Separator } from '$lib/components/ui/separator';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import SkillEditor from '../skill-editor.svelte';
	import { NoteConflictDialog, NoteSyncStatus, NoteTitleInlineInput } from '$lib/components/notes';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import {
		FtDownload as Download,
		FtEdit as Pencil,
		FtExport as FileOutput,
		FtLoader as LoaderCircle
	} from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { importSkillMarkdown } from '$lib/remote/skills/skills.remote';
	import WorkspaceWriteReview from '$lib/components/shared/workspace-write-review.svelte';
	import { serializeSkillManifest } from '$lib/services/skills/manifest';
	import type { WorkspaceSkill } from '$lib/models/workspace-views';
	import { parseProseMirrorDocument, type Note } from '$lib/models/notes';

	let { skill }: { skill: WorkspaceSkill } = $props();
	const syncableNote = (): Note => ({
		...skill.note,
		document: parseProseMirrorDocument(skill.note.document)
	});

	const noteId = $derived(skill.note.id);

	// Same store the notes workspace uses, acquired per note id — the etag and
	// conflict handling below are exactly the notes save path.
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before mounting an editor');
	const draft = untrack(() => session.resources.draft({ type: 'notes', id: [noteId] }));
	const metadata = untrack(() => session.resources.draft({ type: 'skills', id: [noteId] }));
	// The page mounts this editor only while both records are projected, so the
	// bases it renders are captured here, before the first render.
	draft.adopt();
	metadata.adopt();
	let metadataReview = $state(false);

	let describeRef: SkillEditor | undefined = $state();
	let bodyRef: SkillEditor | undefined = $state();
	let editorEpoch = $state(0);
	const editorSession = untrack(() => new EditorSession(() => draft.active));
	const dirty = $derived(editorSession.dirty);
	const saveFailed = $derived(editorSession.failure !== null);
	let conflictOpen = $state(draft.status === 'conflict');
	let importing = $state(false);
	let exporting = $state(false);
	let editingTitle = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	const saving = $derived(editorSession.saving);
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

	// Editor buffers preserve typing while the shared resources refresh.
	let note = $state(untrack(syncableNote));
	let savedDescription = $state(untrack(() => skill.description));

	// Any state where the device copy has not reached the server.
	const unsynced = $derived([draft.status, metadata.status].some((status) => status !== 'synced'));
	const statusDraft = $derived(
		[draft, metadata].find((item) => item.status === 'conflict') ??
			[draft, metadata].find((item) => item.status === 'error') ??
			[draft, metadata].find((item) => item.status !== 'synced') ??
			draft
	);

	onMount(() => () => editorSession.close());

	const AUTOSAVE_DELAY = 2000;

	function markDirty(): void {
		editorSession.changed();
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(() => void save({ auto: true }), AUTOSAVE_DELAY);
	}

	$effect(() => () => clearTimeout(autosaveTimer));

	function save(options: { auto?: boolean } = {}): Promise<void> {
		if (!bodyRef || !describeRef) return Promise.resolve();
		if (!dirty) {
			// Content staged on the device but not on the server: a manual save has
			// to mean "flush what is stuck" rather than silently doing nothing.
			if (!options.auto && unsynced) return retrySync();
			return Promise.resolve();
		}
		clearTimeout(autosaveTimer);
		return editorSession
			.save(
				async () => {
					if (!bodyRef || !describeRef)
						return { kind: 'failure', message: 'The editor is unavailable' };
					const description = describeRef.getMarkdown().trim();
					const details = metadata.value;
					if (!details)
						return {
							kind: 'failure',
							message: 'The skill details are unavailable. Reopen the skill.'
						};
					if (description !== savedDescription || note.title !== details.name) {
						const result = await metadata.stage({
							kind: 'updateSkill',
							noteId: details.noteId,
							description,
							displayName: note.title
						});
						if (result.kind === 'failure') return result;
						savedDescription = description.trim() || details.description;
					}
					const result = await draft.stage(
						noteCommand({
							...note,
							document: bodyRef.getDocument(),
							plainText: bodyRef.getMarkdown()
						})
					);
					if (result.kind === 'failure') return result;
					return result.value
						? { kind: 'saved', value: result.value }
						: { kind: 'failure', message: 'The skill no longer exists' };
				},
				(value, unchanged) => {
					note = unchanged
						? { ...value }
						: { ...note, currentRevision: value.currentRevision, updatedAt: value.updatedAt };
					conflictOpen = draft.status === 'conflict';
				}
			)
			.then(() => {
				if (editorSession.failure && !options.auto) toast.error(editorSession.failure);
			});
	}

	async function retrySync(): Promise<void> {
		const isCurrent = editorSession.checkpoint();
		await Promise.all([draft.retry(), metadata.retry()]);
		const local = draft.value;
		if (!local) {
			toast.error(draft.lastError ?? 'This resource is unavailable');
			return;
		}
		if (isCurrent() && !dirty) note = { ...local };
		conflictOpen = draft.status === 'conflict';
		if (draft.lastError) toast.error(draft.lastError);
	}

	async function useRemoteVersion(): Promise<void> {
		const remote = await draft.discard(editorSession.checkpoint());
		if (remote.kind === 'superseded') return;
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		note = { ...remote.value };
		editorEpoch += 1;
		editorSession.accept();
	}

	async function keepLocalVersion(): Promise<void> {
		const isCurrent = editorSession.checkpoint();
		await draft.keep();
		const local = draft.value;
		if (!local) throw new Error('The local edit is unavailable');
		if (!isCurrent() || dirty) return;
		note = { ...local };
		conflictOpen = draft.status === 'conflict';
		editorEpoch += 1;
	}

	function commitTitle(title: string): void {
		editingTitle = false;
		if (!title || title === note.title) return;
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

	async function ensureSynchronized(message: string): Promise<boolean> {
		if (dirty) await save({ auto: true });
		if (dirty || unsynced) {
			toast.error(message);
			return false;
		}
		return true;
	}

	async function exportSkill(): Promise<void> {
		if (exporting) return;
		exporting = true;
		try {
			// The export must reflect the canvas, so flush pending edits first.
			if (!(await ensureSynchronized('Save the skill before exporting.'))) return;
			await workspaceSession.synchronize();
			const slug = skill.slug;
			const blob = new Blob([serializeSkillManifest({ ...skill, instructions: note.plainText })], {
				type: 'text/markdown;charset=utf-8'
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${slug}.skill.md`;
			anchor.click();
			URL.revokeObjectURL(url);
			// audit-allow: silent-catch — export failure is reported and the skill remains unchanged.
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Skill could not be exported');
		} finally {
			exporting = false;
		}
	}

	async function importSkill(file: File): Promise<void> {
		importing = true;
		try {
			if (!(await ensureSynchronized('Save and synchronize the skill before importing.'))) return;
			const isCurrent = editorSession.checkpoint();
			const raw = await file.text();
			if (!isCurrent()) {
				toast.error('Save the latest edits before importing.');
				return;
			}
			await importSkillMarkdown({ noteId: note.id, raw, baseRevision: note.currentRevision });
			await workspaceSession.synchronize();
			const [opened, details] = await Promise.all([
				draft.read(isCurrent),
				metadata.read(isCurrent)
			]);
			if (opened.kind === 'superseded' || details.kind === 'superseded') {
				toast.info('The import completed. Your later edits are retained for review.');
				return;
			}
			if (opened.kind !== 'ready' || details.kind !== 'ready')
				throw new Error('The imported skill could not be reopened');
			note = { ...opened.value };
			savedDescription = details.value.description;
			editorSession.accept();
			editorEpoch += 1;
			toast.success('Skill imported');
			// audit-allow: silent-catch — invalid import is reported and the existing skill remains unchanged.
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'That file is not a valid SKILL.md');
		} finally {
			importing = false;
		}
	}
</script>

<svelte:window {onkeydown} {onbeforeunload} />

{#snippet syncStatus()}
	<div class="min-w-0 flex-1 sm:flex-none">
		<NoteSyncStatus
			status={saving ? 'saving' : statusDraft.status}
			updatedAt={note.updatedAt}
			reason={statusDraft.lastError}
			onRetry={() => void retrySync()}
			onReview={() => {
				if (statusDraft === metadata) metadataReview = true;
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
					<Tip text={draft.lastError ?? 'The skill could not be saved. Your text is still here.'}>
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
				{:else if unsynced || draft.status === 'saving'}
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
