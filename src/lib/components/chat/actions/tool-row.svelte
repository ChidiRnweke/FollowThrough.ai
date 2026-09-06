<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { FtChevronRight, FtExternal, FtLoader } from '$lib/components/icons';
	import { isWriteTool, toolDisclosure, toolStatusParts } from '$lib/components/agent';
	import { toolRowContext, toolRowTargets, toolRowHeadline } from '$lib/components/agent';
	import { canOpenEntity, openEntity, entityActionLabel } from './open-entity';
	import { CHAT_ROW, CHAT_ROW_DETAIL, CHAT_ROW_ICON } from './chat-row';
	import DisclosureBody from './disclosure/disclosure-body.svelte';
	import EntityList from './disclosure/entity-list.svelte';
	let { tool, shell }: { tool: ChatToolActivity; shell?: ShellContext } = $props();
	const parts = $derived(toolStatusParts(tool, shell));
	const disclosure = $derived(toolDisclosure(tool, shell));
	const targets = $derived(toolRowTargets(tool, disclosure, shell));
	const primary = $derived(
		targets.find((entity) => entity.title === parts.subject) ??
			(targets.length === 1 && !parts.subject ? targets[0] : undefined)
	);
	const remaining = $derived(targets.filter((entity) => entity !== primary));
	const context = $derived(toolRowContext(tool, shell));
	const headline = $derived(toolRowHeadline(disclosure));
	const expandable = $derived(disclosure.kind === 'file-output' && disclosure.lines.length > 0);
	const tone = $derived(
		parts.failed
			? 'text-destructive'
			: isWriteTool(tool.name)
				? 'text-foreground'
				: 'text-muted-foreground'
	);
</script>

{#snippet label()}
	{#if parts.pending}<FtLoader class="{CHAT_ROW_ICON} animate-spin" />{/if}
	<span class="shrink-0">{parts.label}{parts.pending ? '…' : ''}</span>
	{#if parts.subject ?? primary?.title}
		<span class="shrink-0 text-muted-foreground/60" aria-hidden="true">·</span>
		<span class="min-w-0 truncate text-foreground" title={parts.subject ?? primary?.title}
			>{parts.subject ?? primary?.title}</span
		>
	{/if}
{/snippet}
{#snippet openAction()}
	{#if primary && canOpenEntity(primary)}
		<Button
			variant="ghost"
			size="icon-xs"
			class="shrink-0"
			aria-label={entityActionLabel(primary)}
			onclick={() => openEntity(primary)}><FtExternal /></Button
		>
	{/if}
{/snippet}
<div class="min-w-0 py-1">
	{#if expandable}
		<Collapsible.Root>
			<div class="flex min-w-0 items-center gap-1">
				<Collapsible.Trigger class="min-w-0 flex-1">
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="sm"
							class="{CHAT_ROW} min-w-0 [&[data-state=open]>svg:first-child]:rotate-90 {tone}"
						>
							<FtChevronRight
								class="{CHAT_ROW_ICON} transition-transform duration-(--duration-micro)"
							/>{@render label()}
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				{@render openAction()}
			</div>
			{#if context || headline}<p class="px-2 text-xs text-muted-foreground">
					{[context, headline].filter(Boolean).join(' · ')}
				</p>{/if}
			<EntityList entities={remaining} empty="" />
			<Collapsible.Content class={CHAT_ROW_DETAIL}
				><DisclosureBody {disclosure} {tool} {shell} /></Collapsible.Content
			>
		</Collapsible.Root>
	{:else}
		<div class="flex min-w-0 items-center gap-1">
			<div class="{CHAT_ROW} min-w-0 flex-1 {tone}">
				<span class={CHAT_ROW_ICON} aria-hidden="true"></span>{@render label()}
			</div>
			{@render openAction()}
		</div>
		{#if context || headline}<p class="px-2 text-xs text-muted-foreground">
				{[context, headline].filter(Boolean).join(' · ')}
			</p>{/if}
		<EntityList entities={remaining} empty="" />
		{#if disclosure.kind === 'record' || disclosure.kind === 'failure'}<DisclosureBody
				{disclosure}
				{tool}
				{shell}
			/>{/if}
	{/if}
</div>
