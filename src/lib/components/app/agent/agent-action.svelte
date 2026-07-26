<script lang="ts">
	import type { NoteId, ProjectId, TextSelection } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtArrowRight as ArrowRight } from '$lib/components/icons';
	import { askAgent } from '$lib/navigation/responsive-surfaces';
	import type { AgentActionSpec } from './agent-actions';

	let {
		action,
		context,
		subject,
		variant = 'inline',
		compact = false,
		onclick,
		class: className
	}: {
		action: AgentActionSpec;
		/**
		 * Names what the prompt is about, when the screen cannot say it for itself —
		 * the todo panel and the chat share the right-panel slot, so opening one
		 * closes the other and "this todo" would have lost its referent.
		 */
		subject?: string;
		/** What the prompt is about. Anything omitted is filled in by `appContext.capture()`. */
		context?: {
			noteId?: NoteId;
			projectId?: ProjectId;
			selection?: TextSelection;
		};
		/** `inline` joins an existing action cluster. `row` leads an empty region. */
		variant?: 'inline' | 'row';
		/** Drop the label for a tooltip, for headers with no room for one more word. */
		compact?: boolean;
		/** Overrides the default open-the-chat behaviour. Used by the in-panel starters. */
		onclick?: () => void;
		class?: string;
	} = $props();

	const Icon = $derived(action.icon);
	const prompt = $derived(subject ? `${action.prompt}: “${subject}”` : action.prompt);

	function invoke(event: MouseEvent): void {
		if (onclick) {
			onclick();
			return;
		}
		askAgent(
			{ prompt, ...context },
			event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
		);
	}
</script>

<!--
	The one mark that means "the agent", wherever it appears.

	Its whole job is to be recognised a second time: the tinted tile, the icon
	naming a destination and the sentence-shaped prompt are the same three things
	the chat panel's own starters use, so clicking one here and landing on those
	there reads as one pattern rather than two features. That is also why there is
	no new colour and no new surface — `bg-brand/10`, `row-interactive` and `ghost`
	already exist, and per DESIGN_SYSTEM.md the agent gets no hue of its own.

	Weight is deliberately low. `inline` is a ghost button with a muted label, so
	it sits under the primary button it shares a cluster with; the tile is 20px,
	enough to catch a scan and far too small to compete. It is only in `row` — an
	empty region, where acting *is* the screen's purpose — that the affordance is
	allowed to lead.
-->
{#if variant === 'row'}
	<div class="group w-full">
		<!--
			The pointer and the 1px lift come from `row-interactive`, which is the
			same contract `Button` carries — so this variant and `inline` below feel
			identical under the hand without either restating it.
		-->
		<button
			type="button"
			class={[
				'row-interactive flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm',
				className
			]}
			onclick={invoke}
		>
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand transition-colors duration-(--duration-micro) group-hover:bg-brand/20 dark:bg-brand/15"
			>
				<Icon class="size-3.5" />
			</span>
			<span class="min-w-0 flex-1">{action.label}</span>
			<!-- Visible at rest: this row is a target, and an arrow you must hover to
			     find leaves it reading as a sentence. -->
			<ArrowRight
				class="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-[color,opacity] duration-(--duration-micro) group-hover:text-brand group-hover:opacity-100 group-focus-within:opacity-100"
			/>
		</button>
	</div>
{:else}
	<Tip text={compact ? action.label : ''}>
		{#snippet children({ props })}
			<Button
				{...props}
				variant="ghost"
				size={compact ? 'icon-sm' : 'sm'}
				class={[
					'group/agent text-muted-foreground hover:text-foreground',
					!compact && 'pl-1.5',
					className
				]}
				aria-label={compact ? action.label : undefined}
				onclick={invoke}
			>
				<span
					class="flex size-5 shrink-0 items-center justify-center rounded-sm bg-brand/10 text-brand transition-colors duration-(--duration-micro) group-hover/agent:bg-brand/20 dark:bg-brand/15"
				>
					<Icon class="size-3.5" />
				</span>
				{#if !compact}
					{action.label}
				{/if}
			</Button>
		{/snippet}
	</Tip>
{/if}
