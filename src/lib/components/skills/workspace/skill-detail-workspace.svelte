<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import SkillEditor from '../skill-editor.svelte';
	import { NoteConflictDialog, NoteSyncStatus, NoteTitleInlineInput } from '$lib/components/notes';
	import { noteSyncRegistry } from '$lib/stores/notes/registries/note-sync-registry.svelte';
	import {
		FtDownload as Download,
		FtEdit as Pencil,
		FtExport as FileOutput,
		FtLoader as LoaderCircle
	} from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import {
		importSkillMarkdown,
		renameSkill,
		saveSkillDescription
	} from '$lib/remote/skills/skills.remote';
	import type { SkillView } from '$lib/models/skills';
	import type { NoteEtag } from '$lib/models/notes';

	let { data }: { data: { view: SkillView; raw: string; etag: NoteEtag } } = $props();

	const noteId = $derived(data.view.skill.note.id);

	// Same store the notes workspace uses, acquired per note id — the etag and
	// conflict handling below are exactly the notes save path.
	const noteSync = untrack(() => noteSyncRegistry.for(noteId));
	onDestroy(() => noteSyncRegistry.release(noteId));

	let describeRef: SkillEditor | undefined = $state();
	let bodyRef: SkillEditor | undefined = $state();
	let editorEpoch = $state(0);
	let syncReady = $state(false);
	let dirty = $state(false);
	let saveFailed = $state(false);
	let conflictOpen = $state(false);
	let importing = $state(false);
	let exporting = $state(false);
	let editingTitle = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let editVersion = 0;
	let saveQueued = false;
	let activeSave: Promise<void> | undefined;
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

	// Local copies so sync results and device-copy content survive between loads.
	let note = $state(untrack(() => ({ ...data.view.skill.note })));
	let savedDescription = $state(untrack(() => data.view.skill.description));

	// Any state where the device copy has not reached the server.
	const unsynced = $derived(
		noteSync.status === 'pending' || noteSync.status === 'conflict' || noteSync.status === 'error'
	);

	onMount(() => {
		let cancelled = false;
		const stopListening = noteSync.listenForReconnect();
		void noteSync.initialize({ note: data.view.skill.note, etag: data.etag }).then((local) => {
			if (cancelled) return;
			// Server-authoritative fields come from the load; content fields come
			// from the device copy, which may hold unsynced edits.
			note = {
				...data.view.skill.note,
				title: local.title,
				document: local.document,
				plainText: local.plainText,
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

	const AUTOSAVE_DELAY = 2000;

	function markDirty(): void {
		editVersion += 1;
		dirty = true;
		saveFailed = false;
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
		saveQueued = true;
		activeSave ??= flushSaves(options).finally(() => {
			activeSave = undefined;
		});
		return activeSave;
	}

	async function flushSaves(options: { auto?: boolean }): Promise<void> {
		while (saveQueued && bodyRef && describeRef) {
			saveQueued = false;
			const savingVersion = editVersion;
			// The description lives on the skills row and saves without touching
			// the note revision, so it cannot disturb the sync store's base etag.
			// Trimmed: the markdown serializer's trailing newline is not an edit.
			const description = describeRef.getMarkdown().trim();
			if (description !== savedDescription) {
				try {
					await saveSkillDescription({ noteId: note.id, description });
					savedDescription = description;
				} catch {
					saveFailed = true;
					dirty = true;
					if (!options.auto) toast.error('Could not save the description. Try again.');
					return;
				}
			}
			const record = await noteSync.save({
				...note,
				document: bodyRef.getDocument(),
				plainText: bodyRef.getMarkdown()
			});
			if (!record) {
				saveFailed = true;
				dirty = true;
				if (!options.auto) toast.error('Could not save the skill. Try again.');
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
		dirty = false;
		editorEpoch += 1;
		await invalidateAll();
	}

	async function keepLocalVersion(): Promise<void> {
		const record = await noteSync.keepLocal();
		if (!record) return;
		note = { ...record.local };
		conflictOpen = record.state === 'conflict';
		editorEpoch += 1;
		if (record.state === 'synced') await invalidateAll();
	}

	function commitTitle(title: string): void {
		editingTitle = false;
		if (!title || title === note.title) return;
		note = { ...note, title };
		// The note sync carries the title to the notes table; the skills row gets
		// its own rename so the two never wait on each other.
		markDirty();
		renameSkill({ noteId: note.id, name: title }).catch(() =>
			toast.error('Could not rename the skill. Try again.')
		);
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
		if (dirty || noteSync.status !== 'synced') {
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
			await invalidateAll();
			const slug = data.view.skill.slug ?? 'skill';
			const blob = new Blob([data.raw], { type: 'text/markdown;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${slug}.skill.md`;
			anchor.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Skill could not be exported');
		} finally {
			exporting = false;
		}
	}

	async function importSkill(file: File): Promise<void> {
		importing = true;
		try {
			const raw = await file.text();
			await importSkillMarkdown({ noteId: note.id, raw });
			await invalidateAll();
			// The import rewrote the note server-side, so rebase the sync store on
			// the fresh version before the next save, then remount the editors.
			const local = await noteSync.initialize({ note: data.view.skill.note, etag: data.etag });
			note = { ...local };
			savedDescription = data.view.skill.description;
			dirty = false;
			editorEpoch += 1;
			toast.success('Skill imported');
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
			status={noteSync.status}
			updatedAt={note.updatedAt}
			reason={noteSync.lastError}
			onRetry={() => void retrySync()}
			onReview={() => (conflictOpen = true)}
		/>
	</div>
{/snippet}

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
					<Tip
						text={noteSync.lastError ?? 'The skill could not be saved. Your text is still here.'}
					>
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
				{:else if unsynced || noteSync.status === 'saving'}
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

		{#if syncReady}
			{#key `${noteId}:${editorEpoch}`}
				<div class="flex flex-1 flex-col">
					<section class="flex flex-col p-4 md:p-6">
						<div class="flex flex-col gap-1">
							<h2 class="section-title">Describe your skill</h2>
							<p class="text-sm text-muted-foreground">
								When should your agent trigger it? This is what the agent reads to decide when to
								load this skill.
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
		{:else}
			<div class="space-y-3 p-4 md:p-6">
				<Skeleton class="h-5 w-3/4" />
				<Skeleton class="h-5 w-full" />
				<Skeleton class="h-5 w-2/3" />
			</div>
		{/if}
	</div>
</div>

{#if noteSync.record}
	<NoteConflictDialog
		bind:open={conflictOpen}
		record={noteSync.record}
		onUseRemote={useRemoteVersion}
		onKeepLocal={keepLocalVersion}
	/>
{/if}
