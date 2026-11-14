<script lang="ts">
	import type {
		ConnectorTool,
		ConnectorToolPolicyChoice,
		ConnectorToolView
	} from '$lib/models/connectors';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	let {
		service,
		tools,
		disabled,
		onchoose
	}: {
		/** The connector's title, for the line shown when its server offers nothing. */
		service: string;
		tools: readonly ConnectorToolView[];
		disabled: boolean;
		/** A new setting for one tool; `default` hands it back to the server's labels. */
		onchoose: (tool: ConnectorTool, policy: ConnectorToolPolicyChoice | 'default') => void;
	} = $props();

	const choices: readonly { choice: ConnectorToolPolicyChoice; label: string }[] = [
		{ choice: 'allow', label: 'Always allow' },
		{ choice: 'ask', label: 'Ask' },
		{ choice: 'off', label: 'Off' }
	];

	/** What the server's labels say, and whether the setting follows them or the user. */
	function behaviour({ tool }: ConnectorToolView): string {
		const hint = tool.hints.readOnly
			? 'Marked read-only'
			: tool.hints.destructive
				? 'Can change or delete data'
				: 'Can change data';
		return tool.policy.kind === 'default' ? `${hint} · default` : `${hint} · your choice`;
	}

	/**
	 * The group shows the stored setting and nothing else. Pressing the pressed item
	 * again reports `''`, which is no choice; bound one way, that cleared the group
	 * and left the tool showing no setting at all.
	 */
	function select(view: ConnectorToolView, next: string): void {
		const picked = choices.find((option) => option.choice === next);
		if (picked) onchoose(view.tool, picked.choice);
	}
</script>

{#if tools.length === 0}
	<p class="border-t border-border py-3 text-sm text-muted-foreground">
		{service} offers no tools.
	</p>
{:else}
	<ul class="divide-y divide-border border-t border-border">
		{#each tools as view (view.tool.serverName)}
			{@const tool = view.tool}
			<li class="flex flex-col gap-item py-3 sm:flex-row sm:items-start sm:gap-4">
				<div class="flex min-w-0 flex-1 flex-col gap-bind">
					<p class="text-sm font-medium">{tool.title}</p>
					{#if tool.description}
						<p class="line-clamp-2 text-sm text-muted-foreground" title={tool.description}>
							{tool.description}
						</p>
					{/if}
					<p class="provenance-caption">
						{tool.schema.kind === 'unusable'
							? `Cannot be used: ${tool.schema.reason}`
							: behaviour(view)}
					</p>
				</div>
				{#if tool.schema.kind === 'usable'}
					<div class="flex shrink-0 items-center gap-2">
						{#if tool.policy.kind === 'chosen'}
							<Button
								variant="ghost"
								size="sm"
								{disabled}
								onclick={() => onchoose(tool, 'default')}
							>
								Use default
							</Button>
						{/if}
						<ToggleGroup.Root
							type="single"
							variant="outline"
							size="sm"
							bind:value={() => view.effective, (next) => select(view, next)}
							{disabled}
							aria-label="When the agent calls {tool.title}"
						>
							{#each choices as option (option.choice)}
								<ToggleGroup.Item value={option.choice}>{option.label}</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
