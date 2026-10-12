<script lang="ts" module>
	import { workspaceViews } from '$lib/factories/workspace/session';
	import type { WidgetId, WidgetTemplateName } from '$lib/models/widgets';

	/** What the user chose: a new widget from a template, or one this project already has. */
	export type WidgetPick =
		| { readonly kind: 'template'; readonly template: WidgetTemplateName }
		| { readonly kind: 'existing'; readonly widgetId: WidgetId };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { ProjectId } from '$lib/models/projects';
	import type { NoteId } from '$lib/models/notes';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import type { UserId } from '$lib/models/identity';
	import type { DateTime } from '$lib/models/workspace';
	import { widgetCatalog, widgetTemplates, type Widget } from '$lib/models/widgets';
	import { createWidgetEditingController } from '$lib/factories/widgets/editing';
	const widgetEditing = createWidgetEditingController();
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import * as Icon from '$lib/components/icons';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { askAgent } from '$lib/client/shell/responsive-surfaces';
	import WidgetView from './widget-view.svelte';
	import { workspaceViews as sourceViews } from '$lib/factories/workspace/session';
	import { todayLocalDate } from '$lib/client/todos/local-date';
	const widgetSources = (widget: Widget) => sourceViews.widgetSources(widget, todayLocalDate());

	let {
		open = $bindable(false),
		projectId,
		noteId,
		onpick
	}: {
		open?: boolean;
		projectId: ProjectId;
		/** The note the widget goes in, so an agent-built one can be embedded there. */
		noteId: NoteId;
		onpick: (pick: WidgetPick) => void;
	} = $props();

	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before choosing a widget');
	const existing = $derived(workspaceViews.widgets(projectId));

	// A preview is the template as `createWidget` would save it, so what is shown is what is made.
	const previews = (Object.keys(widgetTemplates) as WidgetTemplateName[]).flatMap(
		(template, index) => {
			const result = widgetEditing.createWidget(
				widgetTemplates[template],
				{
					id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as WidgetId,
					userId: session.bootstrap.accountId as UserId,
					projectId: untrack(() => projectId),
					now: new Date(0).toISOString() as DateTime
				},
				widgetCatalog
			);
			return result.kind === 'applied' ? [{ template, widget: result.widget }] : [];
		}
	);

	// The choice is reported before the dialog closes, so the host still knows where to insert.
	function pick(choice: WidgetPick): void {
		onpick(choice);
		open = false;
	}
</script>

{#snippet preview(widget: Widget, label: string, choose: () => void)}
	<li>
		<Button
			variant="ghost"
			class="flex h-auto w-full flex-col items-stretch justify-start gap-item p-2 text-left font-normal whitespace-normal"
			aria-label={label}
			onclick={choose}
		>
			<span class="pointer-events-none block h-44 w-full overflow-hidden">
				<WidgetView {widget} sources={widgetSources(widget)} />
			</span>
			<span class="block truncate text-sm">{widget.title}</span>
		</Button>
	</li>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-3xl" data-widget-picker>
		<Dialog.Header>
			<Dialog.Title>Insert a widget</Dialog.Title>
			<Dialog.Description>
				Describe the widget you need and the agent builds it into this note, or start from a
				template. A widget shown in several notes is one widget: a change in one note appears in all
				of them.
			</Dialog.Description>
		</Dialog.Header>
		<AgentAction
			action={agentActions.widgetInNote}
			variant="row"
			onclick={(trigger) => {
				// Close first: the chat opens beside the note, and the dialog would cover it.
				open = false;
				askAgent({ prompt: agentActions.widgetInNote.prompt, projectId, noteId }, trigger);
			}}
		/>
		<Tabs.Root value="templates">
			<Tabs.List>
				<Tabs.Trigger value="templates">Templates</Tabs.Trigger>
				<Tabs.Trigger value="existing">In this project</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="templates">
				<ul class="grid max-h-112 grid-cols-1 gap-row overflow-y-auto pr-3 sm:grid-cols-2">
					{#each previews as entry (entry.template)}
						{@render preview(entry.widget, `New ${entry.widget.title}`, () =>
							pick({ kind: 'template', template: entry.template })
						)}
					{/each}
				</ul>
			</Tabs.Content>
			<Tabs.Content value="existing">
				{#if existing.length === 0}
					<EmptyState
						icon={Icon.Widget}
						title="No widgets in this project yet."
						hint="A widget you create from a template appears here."
					/>
				{:else}
					<ul class="grid max-h-112 grid-cols-1 gap-row overflow-y-auto pr-3 sm:grid-cols-2">
						{#each existing as widget (widget.id)}
							{@render preview(widget, `Show ${widget.title}`, () =>
								pick({ kind: 'existing', widgetId: widget.id })
							)}
						{/each}
					</ul>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
