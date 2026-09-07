<script lang="ts">
	import type { AgentModel } from '$lib/models/agent';
	import {
		effectiveModel,
		modelMatchesQuery,
		modelMetaLine,
		shortModelName
	} from '$lib/models/agent/model-label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from 'bits-ui';
	import {
		FtCheck as Check,
		FtChevronDown as ChevronDown,
		FtInfo as Info,
		FtSettings as Settings,
		FtSuggestion as Suggestion
	} from '$lib/components/icons';
	import EmptyState from '$lib/components/shared/empty-state.svelte';

	let {
		models,
		value,
		defaultModelId,
		visionValue,
		defaultVisionModelId,
		disabled = false,
		onchange,
		onvisionchange
	}: {
		models: readonly AgentModel[];
		/** This conversation's own choice, or null to inherit the workspace default. */
		value: string | null;
		/** What inheriting resolves to. Server-resolved, so always a real model id. */
		defaultModelId: string;
		visionValue: string | null;
		defaultVisionModelId: string;
		disabled?: boolean;
		onchange: (value: string | null) => void;
		onvisionchange: (value: string | null) => void;
	} = $props();

	let open = $state(false);
	let requestedTab = $state('chat');
	let chatQuery = $state('');
	let visionQuery = $state('');

	const effective = $derived(effectiveModel(models, value, defaultModelId));
	const chatModel = $derived(models.find((model) => model.id === effective.id));
	const visionModels = $derived(models.filter((model) => model.supportsVision));
	/** The chat model reads images itself, so no describer is consulted. */
	const nativeVision = $derived(chatModel?.supportsVision ?? false);
	// "inputs", not "outputs": `supportsVision` is read off the model's input
	// modalities, so it says the model can be shown an image — not that it can draw
	// one. Naming the wrong direction here would send someone to this tab looking
	// for image generation.
	const visionExplanation = $derived(
		nativeVision
			? `${effective.label} supports both text and image inputs.`
			: `${effective.label} cannot see images. This model describes them for it.`
	);

	/**
	 * Derived, not stored and then corrected. Switching the chat model to one that
	 * sees images disables the tab the reader may be standing on, and an effect that
	 * writes `tab` back would be repairing a state the type still lets you reach.
	 * Reading it through here means the vision tab simply cannot be the open one
	 * while there is nothing on it to choose.
	 */
	const tab = $derived(nativeVision ? 'chat' : requestedTab);

	function choose(next: string | null): void {
		open = false;
		chatQuery = '';
		onchange(next);
	}

	function chooseVision(next: string | null): void {
		open = false;
		visionQuery = '';
		onvisionchange(next);
	}
</script>

<!--
	No `Recommended` badge on the rows: the group heading above them already says
	so, and the badge was costing the name about a third of the row — enough that
	two DeepSeek models rendered as the same truncated string. The vendor moves to
	the line beneath for the same reason, where it was already going to appear:
	"DeepSeek: DeepSeek V4 Flash" says it twice and reads as neither.
-->
{#snippet modelRow(
	model: AgentModel,
	selected: string | null,
	pick: (id: string) => void,
	requireTools: boolean
)}
	<Command.Item
		value={`${model.name} ${model.provider} ${model.id}`}
		disabled={requireTools && !model.supportsTools}
		onSelect={() => pick(model.id)}
	>
		<Check class={selected === model.id ? 'opacity-100' : 'opacity-0'} />
		<div class="min-w-0 flex-1">
			<p class="truncate">{shortModelName(model.name)}</p>
			<p class="truncate text-xs text-muted-foreground">{modelMetaLine(model)}</p>
		</div>
	</Command.Item>
{/snippet}

<!--
	Both tabs are the same list, so they are literally the same snippet: a search, a
	row for inheriting the workspace default, the recommended few, and the whole
	catalogue once there is a query. Two shapes for one job is how the vision picker
	ended up as a popover inside a popover.

	The catalogue is the whole of OpenRouter, several hundred entries deep. Rendering
	all of it at rest was affordable behind a gear opened once a week; this control
	opens every turn. The tail arrives with the query instead — with no cap on what
	matches, because a cap would hide models silently. The count lives in the search
	placeholder rather than a line under the list: it is what the field is for, and a
	sentence explaining that typing searches is a caption for the search box.
-->
{#snippet modelList(
	catalogue: readonly AgentModel[],
	selected: string | null,
	defaultId: string,
	query: string,
	pick: (id: string | null) => void,
	requireTools: boolean,
	noun: string
)}
	<Command.List class="max-h-72">
		<Command.Empty>No matching models.</Command.Empty>
		{#if query.trim().length === 0}
			{@const recommended = catalogue.filter((model) => model.recommended)}
			<Command.Group heading="This chat">
				<Command.Item value="workspace default" onSelect={() => pick(null)}>
					<Check class={selected === null ? 'opacity-100' : 'opacity-0'} />
					<div class="min-w-0 flex-1">
						<p class="truncate">Use the workspace default</p>
						<p class="truncate text-xs text-muted-foreground">
							{effectiveModel(catalogue, null, defaultId).label}
						</p>
					</div>
				</Command.Item>
			</Command.Group>
			<Command.Separator />
			{#if recommended.length > 0}
				<Command.Group heading="Recommended">
					{#each recommended as model (model.id)}
						{@render modelRow(model, selected, pick, requireTools)}
					{/each}
				</Command.Group>
			{:else}
				<!--
					`OPENROUTER_RECOMMENDED_MODELS` is unset on a fresh deployment, and the
					vision tab can run out of recommendations even when the chat tab has some.
					Without this the popover opened onto a heading with nothing under it. No
					heading here: the empty state says "No recommended models" itself, and a
					label directly above content that repeats it is a caption for a picture
					that is right there.
				-->
				<EmptyState
					icon={Suggestion}
					title="No recommended {noun}"
					hint="Search to choose from all {catalogue.length}."
				/>
			{/if}
		{:else}
			<Command.Group heading="All models">
				{#each catalogue.filter((model) => modelMatchesQuery(model, query)) as model (model.id)}
					{@render modelRow(model, selected, pick, requireTools)}
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
{/snippet}

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props: triggerProps })}
			<Tip
				text={effective.source === 'conversation'
					? `This chat runs on ${effective.id}`
					: `This chat has no model of its own, so it runs on the workspace default, ${effective.id}`}
			>
				{#snippet children({ props: tipProps })}
					<!--
						Same ghost weight as the approval toggle beside it: both say what the next
						turn will do, and neither is the composer's primary action.

						`min-w-0 shrink` rather than a width cap. `buttonVariants` sets `shrink-0`,
						so a capped button truncates early and still overflows the toolbar; making
						it the row's one flexible item is what lets the name take the room it has
						and give it back only when there is none.
					-->
					<Button
						{...mergeProps(triggerProps, tipProps)}
						variant="ghost"
						size="xs"
						{disabled}
						class="min-w-0 shrink text-muted-foreground group-has-[[data-slot=input-group-control]:focus-visible]/input-group:text-brand-muted-foreground"
						aria-label="Model for this chat: {effective.label}"
					>
						<span class="min-w-0 truncate text-foreground">{effective.label}</span>
						<!--
							The suffix is the answer to the question the bar exists for. Without it a
							reader sees a model name and cannot tell whether this chat picked it or is
							simply showing them the workspace's.
						-->
						{#if effective.source === 'workspace'}
							<span class="shrink-0">· default</span>
						{/if}
						<ChevronDown data-icon="inline-end" />
					</Button>
				{/snippet}
			</Tip>
		{/snippet}
	</Popover.Trigger>
	<!--
		`gap-0 p-0`, and every band below owns its own padding.

		`Popover.Content` is `flex flex-col gap-4` by default, which is what made the
		vision block sit in a pool of air the tight list above it never had: 16px of
		popover gap on top of the block's own padding. The schema instead is one inset
		for everything — `p-1` bands, so a row's text, a group heading, the tab labels
		and the settings link all land on the same 16px line — and vertical separation
		carried by the divider rather than by a gap.

		`w-96`, not the default `w-72`: model names run long, and this is the control
		whose whole job is letting someone read one.
	-->
	<Popover.Content class="w-96 gap-0 p-0" side="top" align="end">
		<Popover.Header class="sr-only">
			<Popover.Title>Models for this chat</Popover.Title>
			<Popover.Description>
				Choose the model that answers and, separately, the one that reads images.
			</Popover.Description>
		</Popover.Header>
		<Tabs.Root value={tab} onValueChange={(next) => (requestedTab = next)} class="gap-0">
			<div class="flex items-center gap-1 p-1 pb-0">
				<Tabs.List variant="line" class="justify-start gap-2">
					<Tabs.Trigger value="chat" class="flex-none">Chat model</Tabs.Trigger>
					<!--
						Nothing to choose when the chat model reads images itself: the server
						ignores a describer in that case, so offering the list would be offering
						a setting with no effect.
					-->
					<Tabs.Trigger value="vision" class="flex-none" disabled={nativeVision}>
						Vision model
					</Tabs.Trigger>
				</Tabs.List>
				<!--
					Beside the tab rather than inside it. A disabled trigger emits no pointer
					events, so a tooltip hung on it would go quiet exactly when it has the most
					to explain — which is the moment the tab greys out.
				-->
				<Tip text={visionExplanation}>
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-xs"
							class="text-muted-foreground"
							aria-label={visionExplanation}
						>
							<Info />
						</Button>
					{/snippet}
				</Tip>
			</div>
			<Tabs.Content value="chat">
				<Command.Root>
					<Command.Input placeholder="Search {models.length} models…" bind:value={chatQuery} />
					{@render modelList(models, value, defaultModelId, chatQuery, choose, true, 'models')}
				</Command.Root>
			</Tabs.Content>
			<Tabs.Content value="vision">
				<Command.Root>
					<Command.Input
						placeholder="Search {visionModels.length} vision models…"
						bind:value={visionQuery}
					/>
					{@render modelList(
						visionModels,
						visionValue,
						defaultVisionModelId,
						visionQuery,
						chooseVision,
						false,
						'vision models'
					)}
				</Command.Root>
			</Tabs.Content>
		</Tabs.Root>
		<Separator />
		<!--
			A way out, not this popover's main action, so it sits at row weight and row
			inset rather than as a full-width button at the foot of a list.
		-->
		<div class="p-1">
			<Button
				variant="ghost"
				size="sm"
				href="/settings"
				class="w-full justify-start px-3 font-normal text-muted-foreground"
			>
				<Settings data-icon="inline-start" /> Change defaults in settings
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
