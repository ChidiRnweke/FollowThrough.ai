<script lang="ts">
	import { untrack } from 'svelte';
	import type { DrawioDiagram } from '$lib/models/diagrams';
	import { Button } from '$lib/components/ui/button';
	import { FtArrowLeft as ArrowLeft } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import DrawioEmbed from '../drawio-embed.svelte';
	import AgentAction from '../../agent/agent-action.svelte';
	import { agentActions } from '../../agent/agent-actions';
	import { saveDrawioDiagram } from '$lib/remote/diagrams/diagrams.remote';
	import type { DrawioExport } from '$lib/client/diagrams/drawio/embed-adapter';

	let { diagram: initialDiagram }: { diagram: DrawioDiagram } = $props();
	let diagram = $state(untrack(() => initialDiagram));

	async function save(output: DrawioExport): Promise<void> {
		try {
			const result = await saveDrawioDiagram({
				noteId: diagram.noteId,
				diagramId: diagram.id,
				source: output.xml,
				renderedSvg: output.svg
			});
			diagram = result.diagram;
			toast.success('Diagram saved');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'The diagram could not be saved.';
			toast.error(message);
			throw new Error(message, { cause: error });
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<div class="flex items-center gap-3">
		<Button href={`/notes/${diagram.noteId}`} variant="ghost" size="sm">
			<ArrowLeft />
			Back to note
		</Button>
		<div class="min-w-0">
			<p class="text-xs text-muted-foreground">draw.io diagram</p>
			<h1 class="truncate text-xl font-semibold tracking-tight">
				{diagram.title ?? 'Untitled diagram'}
			</h1>
		</div>
		<!-- The canvas fills the rest of the screen, so the only chrome is this row. -->
		<AgentAction
			action={agentActions.diagram}
			subject={diagram.title ?? 'Untitled diagram'}
			context={{ noteId: diagram.noteId }}
			class="ml-auto shrink-0"
		/>
	</div>
	<DrawioEmbed xml={diagram.source} title={diagram.title ?? 'Untitled diagram'} oncommit={save} />
</div>
