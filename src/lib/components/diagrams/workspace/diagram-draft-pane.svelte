<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { userFacingMessage } from '$lib/errors';
	import { tick } from 'svelte';
	import type { ConversationId } from '$lib/models/agent';
	import { diagramEtag, type DiagramId } from '$lib/models/diagrams';
	import type { Project, ProjectId } from '$lib/models/projects';
	import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
	import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { diagramTab, draftTab } from '$lib/stores/workbench/tab-ref';
	import { canvasFor } from '$lib/stores/diagrams/canvas.svelte';
	import { canvasOpenings } from '$lib/stores/diagrams/canvas-opening.svelte';
	import { canvasSubjectKey } from '$lib/stores/diagrams/canvas-subject';
	import { keepIntent, keepLabel } from '$lib/stores/diagrams/keep-intent';
	import { rememberCanvasRender } from '$lib/stores/diagrams/canvas-render.svelte';
	import { rasterizeSvg } from '$lib/client/images/rasterize';
	import {
		keepStudioDiagram,
		saveProjectDiagramDraft,
		renameProjectDiagram,
		getProjectDiagram
	} from '$lib/remote/diagrams/diagrams.remote';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';
	import DrawioEmbed, { type DrawioControl, type DrawioStatus } from '../drawio-embed.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtClose as X } from '$lib/components/icons';
	import DiagramStatus from './diagram-status.svelte';
	import DiagramTitle from './diagram-title.svelte';
	import DiagramProjectDialog from './diagram-project-dialog.svelte';

	let {
		sessionKey,
		projectId,
		projects,
		onCloseSplit
	}: {
		sessionKey: ChatSessionKey;
		projectId?: ProjectId;
		projects: readonly Project[];
		onCloseSplit?: () => void;
	} = $props();

	const chat = $derived(chatRegistry.peek(sessionKey));
	const subject = $derived(canvasFor(sessionKey).subject);
	const draft = $derived(subject?.kind === 'draft' ? subject.draft : undefined);
	const draftKey = $derived(canvasSubjectKey(subject));
	let titleOverride = $state<{ readonly key: string; readonly title: string } | undefined>();
	const title = $derived.by(() => {
		const override = titleOverride;
		return override && override.key === draftKey
			? override.title
			: (draft?.title ?? 'Untitled diagram');
	});
	let selectedProjectId = $state<ProjectId | undefined>();
	let projectDialogOpen = $state(false);
	const effectiveProjectId = $derived(projectId ?? selectedProjectId);
	/** The diagram a revision names — which the user may since have deleted. */
	const target = $derived(draft?.diagramId);
	// A transcript is history: it keeps naming the diagram long after the row is
	// gone. Asking for it is what stops the canvas offering to replace something
	// that is not there any more.
	const targetQuery = $derived(target ? getProjectDiagram(target) : undefined);
	const targetMissing = $derived(targetQuery?.error !== undefined);
	const intent = $derived(
		keepIntent({
			...(target ? { target } : {}),
			targetMissing,
			...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
			...(chat?.conversationId ? { conversationId: chat.conversationId } : {})
		})
	);
	const replaces = $derived(intent.kind === 'replace' ? intent.diagramId : undefined);

	let control = $state<DrawioControl | undefined>(undefined);
	let editor = $state<DrawioStatus>({ phase: 'loading', modified: false });

	/**
	 * Keep a picture of what the agent drew, for its next turn to look at.
	 *
	 * The agent writes XML and never sees the result, which is how a diagram can be
	 * declared finished while an icon renders as a broken box. draw.io exports SVG;
	 * only a canvas can turn that into the PNG the model reads.
	 */
	async function rememberRender(output: DrawioExport): Promise<void> {
		const png = await rasterizeSvg(output.svg);
		if (png) rememberCanvasRender(sessionKey, png);
	}

	/**
	 * The save in the embed is what keeps the diagram, or replaces one.
	 *
	 * One step, because the draft is already draw.io. The embed's export is the
	 * preview, and it is the only thing in the system that can draw one — so the
	 * act that produces the preview is the same act that creates the row, and a
	 * diagram can never reach the gallery unable to show itself.
	 */
	async function keep(output: DrawioExport): Promise<void> {
		if (intent.kind === 'blocked') {
			toast.error(intent.reason);
			return;
		}
		try {
			const diagramId =
				intent.kind === 'replace'
					? await replace(intent.diagramId, output)
					: await create(intent.projectId, intent.conversationId, output);
			diagramRegistry.endDraft(sessionKey);
			// The studio does not end here — the way to change a diagram is to keep
			// talking about it. So the canvas becomes the saved diagram in place and
			// the conversation stays beside it, rather than the user being sent to a
			// page where the chat that made it is gone.
			await workbench.replaceTab(draftTab(sessionKey), diagramTab(diagramId));
		} catch (error) {
			const message = userFacingMessage(error, 'The diagram could not be kept.');
			toast.error(message);
			throw new Error(message, { cause: error });
		}
	}

	async function create(
		projectId: ProjectId,
		conversationId: ConversationId,
		output: DrawioExport
	): Promise<DiagramId> {
		const result = await keepStudioDiagram({
			projectId,
			// Also the idempotency key, so a retry after a dropped connection returns
			// the diagram the first attempt made rather than making a second.
			conversationId,
			source: output.xml,
			renderedSvg: output.svg,
			...(title !== 'Untitled diagram' ? { title } : {})
		});
		return result.diagram.id;
	}

	/** A revision writes over the diagram it was drawn against, rather than beside it. */
	async function replace(diagramId: DiagramId, output: DrawioExport): Promise<DiagramId> {
		const current = targetQuery?.current;
		if (!current || current.kind !== 'drawio')
			throw new Error('The diagram being revised is unavailable.');
		const saved = await saveProjectDiagramDraft({
			diagramId,
			source: output.xml,
			baseEtag: diagramEtag(current)
		}).updates(getProjectDiagram(diagramId));
		if (title !== (saved.diagram.title ?? 'Untitled diagram')) {
			await renameProjectDiagram({ diagramId, title, baseEtag: saved.etag }).updates(
				getProjectDiagram(diagramId)
			);
		}
		toast.success('Revision applied as a draft');
		return diagramId;
	}

	function editTitle(next: string): void {
		if (draftKey) titleOverride = { key: draftKey, title: next };
	}

	async function requestKeep(): Promise<void> {
		if (!effectiveProjectId) {
			projectDialogOpen = true;
			return;
		}
		control?.commit();
	}

	async function chooseProject(next: ProjectId): Promise<void> {
		selectedProjectId = next;
		projectDialogOpen = false;
		await tick();
		control?.commit();
	}

	/**
	 * Closing the canvas marks what it was showing as seen, so it stays closed
	 * until there is something new. Without this the next render of the same
	 * diagram reopened the split the user had just dismissed.
	 */
	function close(): void {
		canvasOpenings.markShown(sessionKey, canvasSubjectKey(subject));
		onCloseSplit?.();
	}

	/** Leave the revision unaccepted and go back to the diagram as it stands. */
	async function discard(): Promise<void> {
		if (!replaces) return;
		await workbench.replaceTab(draftTab(sessionKey), diagramTab(replaces));
	}
</script>

<div class="flex h-full w-full min-w-0 flex-1 flex-col" data-diagram-draft-pane={sessionKey}>
	<!--
		One header. What this pane holds is legible from its actions — Discard beside
		Replace is a proposal, Keep is a draft — so nothing needs captioning above a
		diagram that is right there.
	-->
	<header class="flex min-h-10 shrink-0 items-center gap-2 px-4 pb-3 @[40rem]:px-8">
		<DiagramTitle {title} busy={editor.phase === 'saving'} oncommit={editTitle} />
		<DiagramStatus status={editor} onretry={() => control?.retry()}>
			{#snippet idle()}
				{#if draft && intent.kind === 'blocked' && !chat?.conversationId}
					<p class="text-xs text-muted-foreground" role="status" aria-live="polite">
						{intent.reason}
					</p>
				{/if}
			{/snippet}
		</DiagramStatus>
		{#if draft}
			<!--
				Discard only where there is something to go back to. With the diagram
				this was drawn against deleted, the draft is simply a new one.
			-->
			{#if replaces}
				<Button variant="ghost" size="sm" onclick={() => void discard()}>Discard</Button>
			{/if}
			<Button
				size="sm"
				disabled={editor.phase === 'exporting' || editor.phase === 'saving'}
				onclick={() => void requestKeep()}
			>
				{keepLabel(intent)}
			</Button>
		{/if}
		{#if onCloseSplit}
			<!--
				24px, not the row's 8px. Closing the split is a different kind of thing
				from the actions to its left — 8px says "same group", and it put an
				irreversible control one gap away from the one the user actually came
				to press.
			-->
			<div class="ms-4 flex shrink-0 items-center">
				<Tip text="Close split view">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Close split view"
							onclick={close}
						>
							<X />
						</Button>
					{/snippet}
				</Tip>
			</div>
		{/if}
	</header>

	<!-- A flex column: the editor sizes itself against this, and a block parent
	     collapsed it to its 384px floor with the rest of the pane left blank. -->
	<div class="flex min-h-0 flex-1 flex-col px-4 pb-4 @[40rem]:px-8">
		{#if draft}
			<!--
				The same embed the note conversion review uses: secure iframe, retry,
				explicit Save, and leave protection for unsaved edits. Keyed on the
				source because the embed loads its XML once, when it mounts — a new
				revision has to arrive as a new editor, not as a changed prop.
			-->
			{#key draft.source}
				<DrawioEmbed
					xml={draft.source}
					title={draft.title ?? title}
					oncommit={keep}
					oncapturepreview={rememberRender}
					oncontrol={(value) => (control = value)}
					onstatus={(value) => (editor = value)}
				/>
			{/key}
		{:else}
			<p class="text-sm text-muted-foreground">
				A diagram appears here once the conversation has enough structure.
			</p>
		{/if}
	</div>
</div>

<DiagramProjectDialog
	bind:open={projectDialogOpen}
	{projects}
	busy={editor.phase === 'exporting' || editor.phase === 'saving'}
	onconfirm={chooseProject}
/>
