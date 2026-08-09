<script lang="ts">
	import type { NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Tip } from '$lib/components/ui/tooltip';
	import { toast } from 'svelte-sonner';
	import {
		FtChevronRight as ChevronRight,
		FtCopy as Copy,
		FtExternal as OpenInTab,
		FtLoader as LoaderCircle
	} from '$lib/components/icons';
	import { isWriteTool, summariseToolResult, toolStatusParts } from '$lib/components/agent';
	import ChatMarkdown from '../chat-markdown.svelte';
	import { approvalFields } from './tool-approval-fields';

	let { tool, shell }: { tool: ChatToolActivity; shell?: ShellContext } = $props();

	const parts = $derived(toolStatusParts(tool, shell));
	const sent = $derived(approvalFields(tool.arguments, shell));
	const result = $derived(summariseToolResult(tool.output, tool.name));

	/**
	 * The long string arguments — a whole note body, most often. As a "Content: …" line they
	 * were one unbroken grey paragraph with the interesting end cut off; as markdown in a
	 * bounded box they are readable and stay out of the way of the rest of the row.
	 */
	const prose = $derived(
		Object.entries(tool.arguments)
			.filter(([, value]) => typeof value === 'string' && value.length > 120)
			.map(([key, value]) => ({ key, text: value as string }))
	);

	/**
	 * The subject is already on the row, so the disclosure does not say it again — a panel
	 * that opens to repeat the line above it teaches the reader not to open the next one.
	 */
	const sentHeadline = $derived(sent.headline === parts.subject ? undefined : sent.headline);
	const sentDetails = $derived(
		parts.subject
			? sent.details.filter((detail) => !detail.endsWith(`: ${parts.subject}`))
			: sent.details
	);

	const hasSent = $derived(
		Boolean(sentHeadline || sent.location) ||
			sentDetails.length > 0 ||
			(sent.items?.length ?? 0) > 0 ||
			prose.length > 0
	);

	async function copyRaw(): Promise<void> {
		const payload = JSON.stringify(
			{
				tool: tool.name,
				arguments: tool.arguments,
				...(tool.output === undefined ? {} : { result: tool.output }),
				...(tool.failure ? { failure: tool.failure } : {})
			},
			null,
			2
		);
		try {
			await navigator.clipboard.writeText(payload);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Could not copy. Expand the row and copy the text manually.');
		}
	}
</script>

<Collapsible.Root>
	<!--
		The disclosure and the note it names are two different actions, so the note is not
		inside the trigger: clicking a title to open it must not also toggle a panel, and a
		title concatenated into the trigger's sentence could not be either.
	-->
	<div class="group/tool flex items-center gap-1">
		<Collapsible.Trigger class="min-w-0 flex-1">
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="h-7 w-full min-w-0 justify-start gap-1.5 px-1.5 text-xs font-normal [&[data-state=open]>svg:first-child]:rotate-90 {parts.failed
						? 'text-destructive'
						: isWriteTool(tool.name)
							? 'text-foreground'
							: 'text-muted-foreground'}"
				>
					<ChevronRight
						class="size-3.5 shrink-0 transition-transform duration-(--duration-micro)"
					/>
					{#if parts.pending}
						<LoaderCircle class="size-3.5 shrink-0 animate-spin" />
					{/if}
					<span class="shrink-0">{parts.label}{parts.pending ? '…' : ''}</span>
					{#if parts.subject}
						<span class="shrink-0 text-muted-foreground/60" aria-hidden="true">·</span>
						<span class="min-w-0 truncate text-foreground" title={parts.subject}
							>{parts.subject}</span
						>
					{/if}
				</Button>
			{/snippet}
		</Collapsible.Trigger>
		{#if parts.noteId}
			<Tip text="Open in a tab">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-xs"
						class="shrink-0 opacity-0 transition-opacity duration-(--duration-micro) group-hover/tool:opacity-100 group-focus-within/tool:opacity-100"
						aria-label={`Open ${parts.subject ?? 'the note'} in a tab`}
						onclick={() => void workbench.openTab(parts.noteId as NoteId)}
					>
						<OpenInTab />
					</Button>
				{/snippet}
			</Tip>
		{/if}
	</div>

	<!-- 8px between what was sent and what came back — two kinds of thing — and 4px
	     inside each, binding a label to the lines it heads. -->
	<Collapsible.Content>
		<div class="flex flex-col gap-2 py-1 pl-6 text-xs text-muted-foreground">
			{#if tool.failure}
				<p class="break-words text-destructive" role="alert">{tool.failure}</p>
			{/if}

			{#if hasSent}
				<!-- No "Sent" label: the row above already says which call this is, and a
				     heading for the thing directly beneath it is chrome. -->
				<div class="flex flex-col gap-1">
					{#if sentHeadline}
						<p class="break-words text-foreground">{sentHeadline}</p>
					{/if}
					{#each sentDetails as detail (detail)}
						<p class="break-words">{detail}</p>
					{/each}
					{#each sent.items ?? [] as item, index (index)}
						<div class="flex flex-col gap-0.5 border-l border-border pl-2">
							{#if item.headline}
								<p class="break-words text-foreground">{item.headline}</p>
							{/if}
							{#each item.details as detail (detail)}
								<p class="break-words">{detail}</p>
							{/each}
						</div>
					{/each}
					{#if sent.location}
						<p class="break-words">{sent.location}</p>
					{/if}
					{#each prose as field (field.key)}
						<!-- Bounded, because a note body pasted whole pushes the rest of the
						     transcript off the screen for a row that is only evidence. -->
						<div
							class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5"
						>
							<ChatMarkdown content={field.text} />
						</div>
					{/each}
				</div>
			{/if}

			{#if !result.empty && !tool.failure}
				<!-- What came back follows what went out, a step apart. It needs no heading
				     either: a result reads as a result. -->
				<div class="flex flex-col gap-1">
					{#if result.headline}
						<p class="break-words text-foreground">{result.headline}</p>
					{/if}
					{#each result.lines as line (line)}
						<p class="break-words">{line}</p>
					{/each}
					{#if result.more}
						<p>…and {result.more} more</p>
					{/if}
					{#if result.prose}
						<div
							class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5"
						>
							<ChatMarkdown content={result.prose} />
						</div>
					{/if}
				</div>
			{/if}

			{#if !hasSent && result.empty && !tool.failure}
				<p>This call took no arguments and returned nothing to show.</p>
			{/if}

			<!-- The one place raw payloads belong: available, never rendered. -->
			<Button variant="ghost" size="xs" class="self-start" onclick={copyRaw}>
				<Copy data-icon="inline-start" /> Copy raw
			</Button>
		</div>
	</Collapsible.Content>
</Collapsible.Root>
