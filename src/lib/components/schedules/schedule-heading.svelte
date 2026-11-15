<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import * as Icon from '$lib/components/icons';
	import InlineTitleInput from '$lib/components/shared/inline-title-input.svelte';

	// The page header of one schedule. The schedule's name is the page title and is renamed in
	// place, as a note's title is: Enter or leaving the field saves, Escape puts the name back.
	let {
		title,
		placeholder,
		disabled = false,
		onrename,
		actions
	}: {
		/** Empty while a new schedule has no name yet. */
		title: string;
		/** What the title shows while it is empty. */
		placeholder: string;
		disabled?: boolean;
		onrename: (title: string) => void;
		actions?: Snippet;
	} = $props();

	let editing = $state(false);

	function rename(next: string): void {
		editing = false;
		if (next && next !== title) onrename(next);
	}
</script>

<!--
	The same ladder as PageShell's own header: the breadcrumb sits 4px above the title. The row
	keeps the content's measure, so its actions end where the sentence and the runs end.
-->
<div class="flex w-full max-w-3xl flex-wrap items-start justify-between gap-3">
	<div class="flex min-w-0 flex-1 flex-col">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/scheduled">Scheduled</Breadcrumb.Link>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="group/title mt-1 flex min-h-9 min-w-0 items-center gap-1">
			{#if editing}
				<InlineTitleInput
					initialValue={title}
					label="Schedule name"
					onsubmit={rename}
					oncancel={() => (editing = false)}
				/>
			{:else}
				<h1 class="page-title min-w-0 truncate">{title || placeholder}</h1>
				<Tip text="Rename">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class={[
								'shrink-0 text-muted-foreground',
								title &&
									'sm:opacity-0 sm:transition-opacity sm:group-hover/title:opacity-100 sm:focus-visible:opacity-100'
							]}
							aria-label="Rename schedule"
							{disabled}
							onclick={() => (editing = true)}
						>
							<Icon.Edit />
						</Button>
					{/snippet}
				</Tip>
			{/if}
		</div>
	</div>
	{#if actions}
		<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">{@render actions()}</div>
	{/if}
</div>
