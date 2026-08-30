<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { chatTab, type TabId } from '$lib/stores/workbench/tab-ref';
	import { diagramRegistry } from '$lib/stores/diagrams/registries/diagram-registry.svelte';
	import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		sessionKey,
		projectId,
		canvasTab,
		title
	}: {
		sessionKey: ChatSessionKey;
		projectId?: ProjectId;
		/** The tab that can show this diagram: the session's canvas, or a saved one. */
		canvasTab: TabId;
		/** The presented diagram's own title, when it gave one. */
		title?: string;
	} = $props();

	// The route the chat is docked on may not name a project; the workbench's
	// focused tab is the other place that knows.
	const keepableIn = $derived(projectId ?? workbench.activeProjectId);
	// The canvas tab always names a saved diagram now, so there is no unkeepable
	// state left: what the offer points at already exists.
	const unkeepable = false;
	let opening = $state(false);

	/**
	 * Move this conversation into the studio, canvas and all.
	 *
	 * The same session key mounts in the workbench, so the chat registry hands
	 * back the store that is already open here — the conversation continues
	 * rather than forking, and nothing has to be asked twice.
	 */
	async function openStudio(): Promise<void> {
		opening = true;
		try {
			if (keepableIn) diagramRegistry.useProject(sessionKey, keepableIn);
			rightPanel.close();
			await workbench.openSplit(chatTab(sessionKey), canvasTab);
		} finally {
			// The card usually unmounts on the navigation above, but not always — a
			// failed navigation leaves it standing, and a button stuck on "Opening"
			// is a dead control rather than a busy one.
			opening = false;
		}
	}
</script>

<!--
	A chat with no canvas cannot show a diagram, so it offers the place that can.
	One sentence and one action: this is the agent proposing a move, not a panel
	explaining itself.
-->
<div class="flex shrink-0 items-center gap-3 rounded-md p-3 ring-1 ring-inset ring-border">
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium">{title ?? 'Untitled diagram'}</p>
		<p class="text-xs text-muted-foreground">
			{unkeepable
				? 'Choose which project it belongs to when you keep it.'
				: 'Diagrams open side by side with the conversation, where you can edit and keep them.'}
		</p>
	</div>
	<!--
		Disabled while the split navigates: the pane geometry takes 300ms to arrive,
		and without this the button sits unchanged over a screen that has not moved
		yet, which reads as a press that did nothing.
	-->
	<Button size="sm" disabled={opening} onclick={() => void openStudio()}>
		{opening ? 'Opening…' : 'Open in studio'}
	</Button>
</div>
