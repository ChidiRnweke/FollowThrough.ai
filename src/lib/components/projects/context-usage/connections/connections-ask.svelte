<script lang="ts">
	import type { ConnectionNode, ProjectConnectionsReport } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
	import { agentContext } from '$lib/factories/agent/context';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let {
		report,
		projectId,
		projectName,
		selected,
		onask
	}: {
		report: ProjectConnectionsReport;
		projectId: ProjectId;
		projectName: string;
		selected: ConnectionNode | undefined;
		/** Opens the chat with the question prefilled and this map pinned; never sends. */
		onask: (request: ChatHandoff, trigger: HTMLElement | undefined) => void;
	} = $props();

	const timesRead = (node: ConnectionNode) => (node.use.kind === 'read' ? node.use.times : 0);
	const topSkill = $derived(
		report.nodes
			.filter((node) => node.item.kind === 'skill')
			.reduce<ConnectionNode | undefined>(
				(best, node) => (!best || timesRead(node) > timesRead(best) ? node : best),
				undefined
			)
	);
	/** The question loaded into the chat; the chat offers the rest as starters. */
	const loaded = $derived(
		selected
			? `What is ${selected.item.title} read with, and why?`
			: 'Which notes are always read together?'
	);
	const others = $derived([
		...(selected ? ['Which notes are always read together?'] : []),
		`What does ${topSkill?.item.title ?? 'a skill'} make the agent read next?`,
		'Which items are only ever read alone?'
	]);
</script>

<AgentAction
	action={agentActions.connectionsAsk}
	variant="outline"
	onclick={(trigger) =>
		onask(
			{
				prompt: loaded,
				projectId,
				chips: [
					{
						kind: 'connections',
						id: projectId,
						name: agentContext.connectionsName({ name: projectName })
					}
				],
				starters: others
			},
			trigger
		)}
/>
