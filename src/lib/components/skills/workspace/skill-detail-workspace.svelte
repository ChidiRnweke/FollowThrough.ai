<script lang="ts">
	import { createSkillEditor } from '$lib/factories/skills/editor';
	import type { SkillEditorOutcome } from '$lib/controllers/skills/editor';
	import { Input } from '$lib/components/ui/input';
	import { onMount, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Separator } from '$lib/components/ui/separator';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import SkillEditor from '../skill-editor.svelte';
	import { NoteConflictDialog, NoteSyncStatus, NoteTitleInlineInput } from '$lib/components/notes';
	import { workspaceSession } from '$lib/factories/workspace/session';
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
	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before mounting an editor');
	const controller = untrack(() =>
		createSkillEditor(skill, session, () =>
			bodyRef && describeRef
				? {
						description: describeRef.getMarkdown(),
						document: bodyRef.getDocument(),
						plainText: bodyRef.getMarkdown()
					}
				: undefined
		)
	);
	controller.initialize();
	const note = $derived(controller.note);
	const noteId = $derived(note.id);
	const dirty = $derived(controller.dirty);
	const saving = $derived(controller.saving);
	const saveFailed = $derived(controller.failure !== null);
	const importing = $derived(controller.importing);
	const exporting = $derived(controller.exporting);
	const unsynced = $derived(controller.unsynced);
	const status = $derived(controller.status);
	const savedDescription = $derived(controller.savedDescription);
	const editorEpoch = $derived(controller.epoch);
	let conflictOpen = $state(untrack(() => controller.conflict !== undefined));
	let metadataReview = $state(false);
	let editingTitle = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	onMount(() => () => controller.close());
	$effect(() => {
		if (controller.conflict) conflictOpen = true;
	});
	function report(result: SkillEditorOutcome): void {
		if (result.kind === 'failure') toast.error(result.message);
		else if (result.kind === 'info') toast.info(result.message);
		else if (result.kind === 'success') toast.success(result.message);
	}
	function markDirty(): void {
		controller.changed();
	}
	async function save(): Promise<void> {
		report(await controller.save());
	}
	async function retrySync(): Promise<void> {
		report(await controller.retry());
	}
	async function useRemoteVersion(): Promise<void> {
		await controller.useRemote();
	}
	async function keepLocalVersion(): Promise<void> {
		await controller.keepLocal();
	}
	async function exportSkill(): Promise<void> {
		report(await controller.export());
	}
	async function importSkill(file: File): Promise<void> {
		report(await controller.import(file));
	}
	function commitTitle(title: string): void {
		editingTitle = false;
		controller.rename(title);
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
					<Tip
						text={controller.failure ?? 'The skill could not be saved. Your text is still here.'}
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

{#if controller.conflict}
	<NoteConflictDialog
		bind:open={conflictOpen}
		record={controller.conflict}
		onUseRemote={useRemoteVersion}
		onKeepLocal={keepLocalVersion}
	/>
{/if}
