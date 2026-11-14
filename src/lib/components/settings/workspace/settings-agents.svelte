<script lang="ts">
	import { createEditorSession } from '$lib/factories/workspace/editor-session';
	import { onMount } from 'svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import { createSettingsForm } from '$lib/factories/settings/settings-form';
	import type { SettingsForm } from '$lib/stores/settings/settings-form.svelte';

	import { Form } from '$lib/components/ui/form';
	import type { AgentExecutionMode, WebSearchEngine } from '$lib/models/agent';
	import { webSearchEngines } from '$lib/models/agent';
	import { ExecutionModeControl } from '$lib/components/agent';
	import { ExportSlider } from '$lib/components/notes';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import SettingsSaveBar from '../settings-save-bar.svelte';

	interface AgentNumericDefaults {
		readonly webSearchMaxResults: number;
		readonly webSearchMaxTotalResults: number;
		readonly agentMaxTurns: number;
	}

	type AgentSettings = {
		readonly webSearchEngine: WebSearchEngine | null;
		readonly webSearchMaxResults: number | null;
		readonly webSearchMaxTotalResults: number | null;
		readonly agentMaxTurns: number | null;
		readonly executionMode: AgentExecutionMode;
	};

	let { defaults }: { defaults: AgentNumericDefaults } = $props();

	let form = $state<
		| { kind: 'loading' }
		| {
				kind: 'ready';
				draft: WorkspaceDraftController<'agent_preferences'>;
				settings: SettingsForm<AgentSettings>;
		  }
		| { kind: 'failure'; message: string }
	>({ kind: 'loading' });
	const editorSession = createEditorSession(() => form.kind === 'ready' && form.draft.active);
	const busy = $derived(editorSession.saving);
	onMount(() => {
		let cancelled = false;
		void workspaceSession
			.openPreferences('agent_preferences')
			.then(({ draft, value }) => {
				if (cancelled) return;
				const settings = createSettingsForm<AgentSettings>({
					webSearchEngine: value.webSearchEngine ?? null,
					webSearchMaxResults: value.webSearchMaxResults ?? null,
					webSearchMaxTotalResults: value.webSearchMaxTotalResults ?? null,
					agentMaxTurns: value.agentMaxTurns ?? null,
					executionMode: value.executionMode
				});
				form = { kind: 'ready', draft, settings };
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : 'Preferences could not be opened';
				if (!cancelled) form = { kind: 'failure', message };
				return { kind: 'failure', message };
			});
		return () => {
			cancelled = true;
			editorSession.close();
		};
	});
	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (form.kind !== 'ready' || busy || !form.settings.dirty) return;
		const value = form.draft.value;
		if (!value) {
			toast.error('Reopen these preferences before editing');
			return;
		}
		const { draft, settings } = form;
		const patch = settings.values;
		// The session persists what was submitted; the form keeps any later edit as unsaved.
		editorSession.changed();
		await editorSession.save(
			() => draft.stage({ kind: 'updateAgentPreferences', userId: value.userId, patch }),
			() => settings.commit(patch)
		);
		if (editorSession.failure) toast.error(editorSession.failure);
		else toast.success('Agent defaults saved on this device');
	}

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

{#if form.kind === 'failure'}
	<p role="alert" class="text-sm text-destructive">{form.message}</p>
{:else if form.kind === 'loading'}
	<p role="status" class="text-sm text-muted-foreground">Loading preferences…</p>
{:else}
	{@const settings = form.settings}
	{@const values = settings.values}
	<Form onsubmit={save} class="flex max-w-3xl flex-col gap-group">
		<!-- The pb-2 steps the preamble out to 32px so it does not read as a caption of the fields. -->
		<p class="pb-2 text-sm text-muted-foreground">
			Choose what the agent may do without asking and how far it may go. Every setting left unset
			follows this deployment's default.
		</p>

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
						value={values.webSearchEngine ?? ''}
						onValueChange={(next) => {
							if (next === '') settings.set('webSearchEngine', null);
							else {
								const engine = webSearchEngines.find((engine) => engine === next);
								if (!engine) throw new Error('Unknown search engine');
								settings.set('webSearchEngine', engine);
							}
						}}
					>
						<Select.Trigger class="w-48" aria-label="Web search engine"
							>{values.webSearchEngine ?? 'App default'}</Select.Trigger
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
						value={values.webSearchMaxResults ?? defaults.webSearchMaxResults}
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
							values.webSearchMaxResults === null ? `Default (${current})` : String(current)}
						onchange={(next) => settings.set('webSearchMaxResults', next)}
					/>
					{#if values.webSearchMaxResults !== null}
						<Button
							type="button"
							variant="link"
							size="sm"
							class="h-auto self-end px-0 text-xs"
							onclick={() => settings.set('webSearchMaxResults', null)}>Reset to default</Button
						>
					{/if}
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
						value={values.webSearchMaxTotalResults ?? defaults.webSearchMaxTotalResults}
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
							values.webSearchMaxTotalResults === null ? `Default (${current})` : String(current)}
						onchange={(next) => settings.set('webSearchMaxTotalResults', next)}
					/>
					{#if values.webSearchMaxTotalResults !== null}
						<Button
							type="button"
							variant="link"
							size="sm"
							class="h-auto self-end px-0 text-xs"
							onclick={() => settings.set('webSearchMaxTotalResults', null)}
							>Reset to default</Button
						>
					{/if}
				</div>
			</div>
			<div class={rowClass}>
				<Field.Content class="min-w-0">
					<Field.Title>Turn limit</Field.Title>
					<Field.Description
						>Tool-calling steps one reply may take before it stops. Raise it for research, lower it
						to cap spend. Between 1 and 50.</Field.Description
					>
				</Field.Content>
				<div class={controlClass}>
					<ExportSlider
						label="Turn limit"
						showLabel={false}
						value={values.agentMaxTurns ?? defaults.agentMaxTurns}
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
						format={(current) =>
							values.agentMaxTurns === null ? `Default (${current})` : String(current)}
						onchange={(next) => settings.set('agentMaxTurns', next)}
					/>
					{#if values.agentMaxTurns !== null}
						<Button
							type="button"
							variant="link"
							size="sm"
							class="h-auto self-end px-0 text-xs"
							onclick={() => settings.set('agentMaxTurns', null)}>Reset to default</Button
						>
					{/if}
				</div>
			</div>
			<div class={rowClass}>
				<Field.Content class="min-w-0">
					<Field.Title>Default execution mode</Field.Title>
					<Field.Description
						>Approval required pauses durable changes for review. Auto-accept applies agent changes
						immediately, and runs connector tools set to Ask without pausing; FollowThrough cannot
						undo what they do in the connected service.</Field.Description
					>
				</Field.Content>
				<div class={controlClass}>
					<ExecutionModeControl
						bind:value={() => values.executionMode, (next) => settings.set('executionMode', next)}
					/>
				</div>
			</div>
		</div>
		<SettingsSaveBar dirty={settings.dirty} saving={busy} onundo={() => settings.undo()} />
	</Form>
{/if}
