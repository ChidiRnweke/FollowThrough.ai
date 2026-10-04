<script lang="ts" module>
	import type { WidgetId, WidgetTemplateName } from '$lib/models/widgets';

	/** What the user chose: a new widget from a template, or one this project already has. */
	export type WidgetPick =
		| { readonly kind: 'template'; readonly template: WidgetTemplateName }
		| { readonly kind: 'existing'; readonly widgetId: WidgetId };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { ProjectId } from '$lib/models/projects';
	import type { UserId } from '$lib/models/identity';
	import type { DateTime } from '$lib/models/workspace';
	import { widgetCatalog, widgetTemplates, type Widget } from '$lib/models/widgets';
	import { createWidget } from '$lib/services/widgets/edits';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtWidget as WidgetIcon } from '$lib/components/icons';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import WidgetView from './widget-view.svelte';
	import { widgetSources } from '$lib/stores/widgets/widget-sources.svelte';

	let {
		open = $bindable(false),
		projectId,
		onpick
	}: { open?: boolean; projectId: ProjectId; onpick: (pick: WidgetPick) => void } = $props();

	const session = untrack(() => workspaceSession.current);
	if (!session) throw new Error('Open the workspace before choosing a widget');
	const existing = $derived(session.resources.views.widgets(projectId));

	// A preview is the template as `createWidget` would save it, so what is shown is what is made.
	const previews = (Object.keys(widgetTemplates) as WidgetTemplateName[]).flatMap(
		(template, index) => {
			const result = createWidget(
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
			class="flex h-auto w-full flex-col items-stretch justify-start gap-2 p-2 text-left font-normal whitespace-normal"
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
				Start from a template, or show a widget this project already has. A widget shown in several
				notes is one widget: a change in one note appears in all of them.
			</Dialog.Description>
		</Dialog.Header>
		<Tabs.Root value="templates">
			<Tabs.List>
				<Tabs.Trigger value="templates">Templates</Tabs.Trigger>
				<Tabs.Trigger value="existing">In this project</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="templates">
				<ul class="grid max-h-112 grid-cols-1 gap-4 overflow-y-auto pr-3 sm:grid-cols-2">
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
						icon={WidgetIcon}
						title="No widgets in this project yet."
						hint="A widget you create from a template appears here."
					/>
				{:else}
					<ul class="grid max-h-112 grid-cols-1 gap-4 overflow-y-auto pr-3 sm:grid-cols-2">
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
