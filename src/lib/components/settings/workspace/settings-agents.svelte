<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { AgentExecutionMode, AgentPreferences } from '$lib/models/agent';
	import { webSearchEngines } from '$lib/models/agent';
	import { saveAgentPreferences } from '$lib/remote/settings/settings.remote';
	import { ExecutionModeControl } from '$lib/components/agent';
	import { ExportSlider } from '$lib/components/notes';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';

	interface AgentNumericDefaults {
		readonly webSearchMaxResults: number;
		readonly webSearchMaxTotalResults: number;
		readonly agentMaxTurns: number;
	}

	let { preferences, defaults }: { preferences: AgentPreferences; defaults: AgentNumericDefaults } =
		$props();
	let searchEngine = $state('');
	let searchMaxResults = $state<number | null>(null);
	let searchMaxTotalResults = $state<number | null>(null);
	let maxTurns = $state<number | null>(null);
	let mode = $state<AgentExecutionMode>('approval_required');
	$effect(() => {
		searchEngine = preferences.webSearchEngine ?? '';
		searchMaxResults = preferences.webSearchMaxResults ?? null;
		searchMaxTotalResults = preferences.webSearchMaxTotalResults ?? null;
		maxTurns = preferences.agentMaxTurns ?? null;
		mode = preferences.executionMode;
	});

	// Nothing on this panel moves when it saves — the controls already show what was typed —
	// so without a toast the button reads as dead. `submit()` resolves false on a validation
	// issue and throws on a failed request; both are the same story to tell here.
	const enhanced = saveAgentPreferences.enhance(async (form) => {
		try {
			if (await form.submit()) toast.success('Agent defaults saved');
			else toast.error('Could not save agent defaults. Check the values and try again.');
		} catch {
			toast.error('Could not save agent defaults. Try again.');
		}
	});

	const describeResultsPerSearch = (current: number): string => {
		if (current < 5) return 'narrow lookups';
		if (current < 15) return 'focused results';
		if (current <= 30) return 'broad coverage';
		return 'exhaustive';
	};
	const describeTotalResults = (current: number): string => {
		if (current < 20) return 'light research budget';
		if (current < 60) return 'moderate research budget';
		return 'heavy research budget';
	};
	const describeTurnLimit = (current: number): string => {
		if (current < 10) return 'short, cheap runs';
		if (current < 30) return 'standard runs';
		return 'long research runs';
	};

	// Every setting is one row: text column left, control column right at lg, stacked below it.
	// The row's bottom border is the divider so it follows whichever column runs taller.
	const rowClass =
		'flex flex-col gap-2 border-b border-border py-6 last:border-b-0 lg:flex-row lg:items-start lg:gap-8';
	const controlClass = 'flex w-full shrink-0 flex-col lg:w-72';
</script>

<Form {...enhanced} class="flex max-w-3xl flex-col gap-6">
	<!-- The preamble carries the submit action on its row, like the scope row on the
	     tools panel, and the pb-2 steps the row out past the gap to the fields below. -->
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
		<p class="text-sm text-muted-foreground">
			Choose what the agent may do without asking and how far it may go. Every setting left unset
			follows this deployment's default.
		</p>
		<Button type="submit">Save agent defaults</Button>
	</div>

	<div class="flex flex-col">
		<div class={rowClass}>
			<Field.Content class="min-w-0">
				<Field.Title>Web search engine</Field.Title>
				<Field.Description
					>Which provider fulfils the agent's searches. Auto lets the model choose.</Field.Description
				>
			</Field.Content>
			<div class={controlClass}>
				<Select.Root
					type="single"
					value={searchEngine}
					onValueChange={(next) => (searchEngine = next)}
				>
					<Select.Trigger class="w-48" aria-label="Web search engine"
						>{searchEngine || 'App default'}</Select.Trigger
					>
					<Select.Content>
						<Select.Group>
							<Select.Item value="">App default</Select.Item>
							{#each webSearchEngines as engine (engine)}
								<Select.Item value={engine}>{engine}</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
				<Input type="hidden" name="webSearchEngine" value={searchEngine} />
			</div>
		</div>
		<div class={rowClass}>
			<Field.Content class="min-w-0">
				<Field.Title>Results per search</Field.Title>
				<Field.Description>Caps a single search. Between 1 and 50.</Field.Description>
			</Field.Content>
			<div class={controlClass}>
				<!-- Unset means "follow the deployment default": the slider rests on the
				     default until dragged, and Reset hands the setting back rather than
				     pinning the number it happened to show. -->
				<ExportSlider
					label="Results per search"
					showLabel={false}
					value={searchMaxResults ?? defaults.webSearchMaxResults}
					min={1}
					max={50}
					step={1}
					defaultValue={defaults.webSearchMaxResults}
					anchors={[
						{ value: 1, label: 'Focused' },
						{ value: defaults.webSearchMaxResults, label: 'Default' },
						{ value: 50, label: 'Exhaustive' }
					]}
					describe={describeResultsPerSearch}
					format={(current) =>
						searchMaxResults === null ? `Default (${current})` : String(current)}
					onchange={(next) => (searchMaxResults = next)}
				/>
				{#if searchMaxResults !== null}
					<Button
						type="button"
						variant="link"
						size="sm"
						class="h-auto self-end px-0 text-xs"
						onclick={() => (searchMaxResults = null)}>Reset to default</Button
					>
				{/if}
				<Input
					type="hidden"
					name="webSearchMaxResults"
					value={searchMaxResults?.toString() ?? ''}
				/>
			</div>
		</div>
		<div class={rowClass}>
			<Field.Content class="min-w-0">
				<Field.Title>Total results per run</Field.Title>
				<Field.Description>Across every search in one run. Between 1 and 100.</Field.Description>
			</Field.Content>
			<div class={controlClass}>
				<ExportSlider
					label="Total results per run"
					showLabel={false}
					value={searchMaxTotalResults ?? defaults.webSearchMaxTotalResults}
					min={1}
					max={100}
					step={1}
					defaultValue={defaults.webSearchMaxTotalResults}
					anchors={[
						{ value: 1, label: 'Light' },
						{ value: defaults.webSearchMaxTotalResults, label: 'Default' },
						{ value: 100, label: 'Heavy' }
					]}
					describe={describeTotalResults}
					format={(current) =>
						searchMaxTotalResults === null ? `Default (${current})` : String(current)}
					onchange={(next) => (searchMaxTotalResults = next)}
				/>
				{#if searchMaxTotalResults !== null}
					<Button
						type="button"
						variant="link"
						size="sm"
						class="h-auto self-end px-0 text-xs"
						onclick={() => (searchMaxTotalResults = null)}>Reset to default</Button
					>
				{/if}
				<Input
					type="hidden"
					name="webSearchMaxTotalResults"
					value={searchMaxTotalResults?.toString() ?? ''}
				/>
			</div>
		</div>
		<div class={rowClass}>
			<Field.Content class="min-w-0">
				<Field.Title>Turn limit</Field.Title>
				<Field.Description
					>Tool-calling steps one reply may take before it stops. Raise it for research, lower it to
					cap spend. Between 1 and 50.</Field.Description
				>
			</Field.Content>
			<div class={controlClass}>
				<ExportSlider
					label="Turn limit"
					showLabel={false}
					value={maxTurns ?? defaults.agentMaxTurns}
					min={1}
					max={50}
					step={1}
					defaultValue={defaults.agentMaxTurns}
					anchors={[
						{ value: 1, label: 'Cautious' },
						{ value: defaults.agentMaxTurns, label: 'Default' },
						{ value: 50, label: 'Deep research' }
					]}
					describe={describeTurnLimit}
					format={(current) => (maxTurns === null ? `Default (${current})` : String(current))}
					onchange={(next) => (maxTurns = next)}
				/>
				{#if maxTurns !== null}
					<Button
						type="button"
						variant="link"
						size="sm"
						class="h-auto self-end px-0 text-xs"
						onclick={() => (maxTurns = null)}>Reset to default</Button
					>
				{/if}
				<Input type="hidden" name="agentMaxTurns" value={maxTurns?.toString() ?? ''} />
			</div>
		</div>
		<div class={rowClass}>
			<Field.Content class="min-w-0">
				<Field.Title>Default execution mode</Field.Title>
				<Field.Description
					>Approval required pauses durable changes for review. Auto-accept applies agent changes
					immediately.</Field.Description
				>
			</Field.Content>
			<div class={controlClass}>
				<ExecutionModeControl bind:value={mode} />
				<Input type="hidden" name="executionMode" value={mode} />
			</div>
		</div>
	</div>
</Form>
