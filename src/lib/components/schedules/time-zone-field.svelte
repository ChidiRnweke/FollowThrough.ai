<script lang="ts">
	import type { IanaTimeZone } from '$lib/models/schedules';
	import { ianaTimeZoneSchema } from '$lib/models/schedules';
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import * as Icon from '$lib/components/icons';

	let {
		value,
		disabled = false,
		onchange
	}: {
		value: IanaTimeZone;
		disabled?: boolean;
		onchange: (timeZone: IanaTimeZone) => void;
	} = $props();

	let open = $state(false);
	// The platform's own list, read when the list opens: it is several hundred names.
	const zones = $derived(open ? Intl.supportedValuesOf('timeZone') : []);

	function choose(zone: string): void {
		open = false;
		onchange(ianaTimeZoneSchema.parse(zone));
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				{disabled}
				class="text-base font-medium"
				aria-label="Time zone: {value}"
			>
				{workspaceViews.scheduleZoneName(value)}
				<Icon.ChevronDown class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-72 p-0" align="start">
		<Popover.Header class="sr-only">
			<Popover.Title>Choose a time zone</Popover.Title>
			<Popover.Description>The schedule runs on the clock of this place.</Popover.Description>
		</Popover.Header>
		<Command.Root>
			<Command.Input placeholder="Search places…" />
			<Command.List class="max-h-72">
				<Command.Empty>No matching place.</Command.Empty>
				<Command.Group>
					{#each zones as zone (zone)}
						<Command.Item value={zone} onSelect={() => choose(zone)}>
							<Icon.Check class={zone === value ? 'opacity-100' : 'opacity-0'} />
							{zone.replaceAll('_', ' ')}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
