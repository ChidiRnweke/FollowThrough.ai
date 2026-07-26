<script lang="ts">
	import { fly, slide } from 'svelte/transition';
	import { page } from '$app/state';
	import type { NoteId, ProjectId, ShellContext } from '$lib/models';
	import { starterSurface } from './chat-starters';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import { Button } from '$lib/components/ui/button';
	import {
		FtAttachments as Attachments,
		FtDocument as Document,
		FtMemory as Memory,
		FtTodos as Todos
	} from '$lib/components/icons';
	import { agentCapabilityCopy, type AgentCapability } from '$lib/components/app/labels';
	import { PrefersReducedMotion } from '$lib/hooks/prefers-reduced-motion.svelte';
	import { getCapabilityCounts } from '$lib/remote/agent-context.remote';

	// The note is taken as a boolean, never as a title: the open note already
	// appears by name once, as the dismissible context chip above the composer.
	// Naming it here too said the same thing twice and cost a row — but the
	// sentence still has to acknowledge it, or it claims the agent reads only the
	// project while a note is sitting right there in scope.
	let {
		shell,
		activeProjectId,
		activeNoteId,
		compact = false
	}: {
		shell?: ShellContext;
		activeProjectId?: ProjectId;
		activeNoteId?: NoteId;
		/**
		 * Once a thread is running the transcript needs the height more than the
		 * orientation does: the sentence collapses away and the stats fall back to a
		 * single row of icon and count, with the hover cards carrying the words.
		 */
		compact?: boolean;
	} = $props();

	const reduced = new PrefersReducedMotion();

	// Notes are already in the client, so they never cost a round trip.
	const noteCount = $derived(
		shell?.noteTree.filter(
			(note) => note.projectId === activeProjectId && note.kind !== 'folder' && !note.archivedAt
		).length ?? 0
	);
	const project = $derived(shell?.projects.find((entry) => entry.id === activeProjectId));

	const EMPTY = { memory: 0, attachments: 0, todos: 0 } as const;

	// The non-await form on purpose: a failed count must not throw into the
	// nearest boundary and take the panel down. The sentence is still true
	// without it, and an unresolved count reads the same as "nothing yet".
	const query = $derived(getCapabilityCounts({ projectId: activeProjectId }));
	const counts = $derived(query.current ?? EMPTY);

	interface Capability {
		readonly key: AgentCapability;
		readonly count: number;
		readonly href: string;
		readonly icon: typeof Memory;
	}

	const capabilities = $derived.by((): Capability[] => {
		const scope = activeProjectId;
		return [
			{
				key: 'memory',
				count: counts.memory,
				href: scope ? `/projects/${scope}/memory` : '/profile',
				icon: Memory
			},
			{
				key: 'notes',
				count: noteCount,
				href: scope ? `/projects/${scope}` : '/',
				icon: Document
			},
			{
				key: 'todos',
				count: counts.todos,
				href: scope ? `/projects/${scope}/todos` : '/todos',
				icon: Todos
			},
			{
				key: 'attachments',
				count: counts.attachments,
				href: scope ? `/projects/${scope}/attachments` : '/',
				icon: Attachments
			}
		];
	});

	// The same surface the starters below are chosen from, so the sentence and the
	// prompts can never disagree about where the user is. Naming the surface is
	// the point: "your Inbox project" and "your Inbox todo board" read as places,
	// where a bare "Inbox" read as a label.
	const surface = $derived(
		starterSurface({
			hasNote: activeNoteId !== undefined,
			hasProject: activeProjectId !== undefined,
			pathname: page.url.pathname
		})
	);

	// Re-entering the whole line on a scope change is the point: the user should
	// see the agent re-orient, not watch a number tick over. The surface belongs
	// in the key too — moving from a note to the todo board rewrites the sentence.
	const scopeKey = $derived(`${activeProjectId ?? 'none'}:${surface}`);
	const STAGGER = 40;
	// `fly` with no offset and no delay is a plain fade, which is the reduced-motion
	// fallback the CSS guard in layout.css cannot give us for JS transitions.
	const settle = (index: number) =>
		reduced.current ? { duration: 125 } : { y: 4, delay: index * STAGGER, duration: 150 };
	// The sentence collapsing its own height is what makes the shrink read as one
	// movement rather than as a disappearance. Reduced motion takes it instantly.
	const collapse = $derived(reduced.current ? { duration: 0 } : { duration: 160 });
</script>

<!--
	Plain language over jargon: the sentence says the agent reads these things
	before it answers, which is the whole mechanism, and the counts below are the
	list it reads. The project name is the one accent, because scope is the only
	thing here that is identity rather than metadata.

	This block is the panel's anchor — the largest type in the panel. That is a
	deliberate inversion of "orientation text stays quiet": with zeros rendered
	(see DESIGN_SYSTEM.md, the one sanctioned empty-value exception) the row is a
	standing map of what the agent can and cannot see, not a sentence you read
	once. It carries no card: a border and wash here made the panel's calmest
	content look like its loudest control. Type scale and the space beneath the
	stat row do the separating instead, which is the same currency every group
	below it trades in.

	All of that describes the expanded state, which is the empty state. Once a
	question is asked the same instance goes compact and gives that height back to
	the transcript: sentence gone, labels collapsed, one row of icon and count. The
	map does not disappear — it stops narrating, and the hover cards still hold
	every word.
-->
{#key scopeKey}
	<!-- The space under the sentence is the sentence's own padding, not a flex gap:
	     `slide` animates padding, so the whole block — words and the air beneath
	     them — collapses as one movement instead of the gap snapping shut first. -->
	<div class="@container flex flex-col pb-2">
		{#if !compact}
			<p class="section-title pb-3 text-balance" transition:slide={collapse}>
				{#if !project}
					Before it answers, the agent reads what is in your workspace
				{:else if surface === 'note'}
					Before it answers, the agent reads this note and what is in your
					<a class="text-brand hover:underline" href="/projects/{project.id}">{project.name}</a>
					project
				{:else if surface === 'todos'}
					Before it answers, the agent reads what is on your
					<a class="text-brand hover:underline" href="/projects/{project.id}/todos"
						>{project.name}</a
					>
					todo board
				{:else}
					Before it answers, the agent reads what is in your
					<a class="text-brand hover:underline" href="/projects/{project.id}">{project.name}</a>
					project
				{/if}
			</p>
		{/if}
		<!-- The block is its own container: the panel is user-resizable, and four
		     stat columns stop fitting well before the panel hits its minimum. Compact
		     drops the grid for one wrapping row, and carries the scope the collapsed
		     sentence used to state in its own label. -->
		<div
			class={compact
				? 'flex flex-wrap items-center gap-x-4 gap-y-1'
				: 'grid grid-cols-2 gap-x-2 gap-y-3 @[15rem]:grid-cols-4'}
			role="group"
			aria-label="Agent context: {project?.name ?? 'workspace'}"
		>
			{#each capabilities as capability, index (capability.key)}
				{@const copy = agentCapabilityCopy[capability.key]}
				{@const Icon = capability.icon}
				<div in:fly={settle(index)} class="min-w-0">
					<HoverCard.Root openDelay={120}>
						<HoverCard.Trigger>
							{#snippet child({ props })}
								<a
									{...props}
									href={capability.href}
									aria-label="{copy.label}: {capability.count}"
									class="group/stat flex min-w-0 gap-0.5 rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring {compact
										? 'flex-row items-center'
										: 'flex-col'}"
								>
									<!--
										A zero stays rendered but recedes to muted, so the row reads as a
										map at a glance without hiding anything. Presence and absence are
										both information here.
									-->
									<span
										class="flex items-center gap-1.5 tabular-nums {compact
											? 'text-xs'
											: 'text-sm'} {capability.count > 0
											? 'text-foreground'
											: 'text-muted-foreground'} group-hover/stat:text-brand"
									>
										<Icon class="shrink-0 {compact ? 'size-3' : 'size-3.5'}" />
										{capability.count}
									</span>
									<!-- The label collapses by width rather than unmounting, so the row
									     narrows into the icons instead of the words blinking out. -->
									<span
										class="eyebrow truncate transition-[max-width,opacity] duration-150 group-hover/stat:text-foreground {compact
											? 'max-w-0 opacity-0'
											: 'max-w-40 opacity-100'}">{copy.label}</span
									>
								</a>
							{/snippet}
						</HoverCard.Trigger>
						<HoverCard.Content class="w-64 gap-2" side="top" align="start">
							<!-- Compact hides the visible label, so the card has to name what it
							     is explaining before it explains it. -->
							{#if compact}
								<p class="eyebrow">{copy.label}</p>
							{/if}
							<p class="text-sm">{copy.teaches}</p>
							<Button variant="outline" size="xs" href={capability.href} class="self-start">
								{copy.action}
							</Button>
						</HoverCard.Content>
					</HoverCard.Root>
				</div>
			{/each}
		</div>
	</div>
{/key}
