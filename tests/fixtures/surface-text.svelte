<script lang="ts">
	import TodoCard from '$lib/components/todos/todo-card.svelte';
	import ChatMarkdown from '$lib/components/chat/chat-markdown.svelte';
	import { Calendar } from '$lib/components/ui/calendar';
	import { CalendarDate } from '@internationalized/date';
	import { page } from '$app/state';
	import WorkspaceTabs from '$lib/components/shell/workbench/workspace-tabs.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import type { ShellContext } from '$lib/models/workspace';
	import {
		todoBuilder,
		noteBuilder,
		projectBuilder,
		testActor,
		testNow,
		testNoteId
	} from '$lib/testing/workspace/fixtures/domain-builders';

	const notes = [
		noteBuilder({ title: 'atlas' }),
		noteBuilder({ id: testNoteId(2), title: 'vendor RFP' }),
		noteBuilder({ id: testNoteId(3), title: 'Meeting notes' })
	];
	const shell: ShellContext = {
		user: {
			id: testActor().userId,
			email: 'reader@example.test',
			displayName: 'Reader',
			role: 'USER',
			createdAt: testNow,
			updatedAt: testNow
		},
		projects: [projectBuilder({ name: 'General' })],
		noteTree: notes,
		skills: [],
		pendingSuggestionCount: 0,
		pendingMemoryNotifications: []
	};
	function showTabs(empty: boolean, split = true) {
		workbench.openTabs = empty ? [] : notes.map((note) => note.id);
		workbench.focusedTabId = empty ? undefined : notes[1].id;
		workbench.splitTabId = !empty && split ? notes[2].id : undefined;
		workbench.pinnedTabs = empty ? [] : [notes[0].id];
	}
	showTabs(page.url.searchParams.has('empty'));
</script>

<Tooltip.Provider>
	<main data-surface-fixture class="bg-background text-foreground p-4">
		<WorkspaceTabs
			{shell}
			sessions={[]}
			oncreateNote={() => undefined}
			ontoggleHidden={() => undefined}
		/>
		<section data-fields class="mt-8 flex max-w-xl flex-col gap-4">
			<Input placeholder="Search notes" aria-label="Search notes" />
			<Textarea placeholder="Write a question" aria-label="Write a question" />
			<InputGroup.Root>
				<InputGroup.Input placeholder="Find a project" aria-label="Find a project" />
				<InputGroup.Addon><InputGroup.Text>Project</InputGroup.Text></InputGroup.Addon>
			</InputGroup.Root>
		</section>
		<section data-additional-surfaces class="mt-8 flex max-w-xl flex-col gap-4">
			<TodoCard
				lifted
				view={{
					todo: todoBuilder({
						title: 'Waiting for review',
						responsibility: 'waiting_on',
						waitingOn: 'Alex'
					}),
					sourceNote: { id: notes[0].id, title: notes[0].title }
				}}
			/>
			<TodoCard
				lifted
				view={{ todo: todoBuilder({ title: 'Completed review', status: 'done' }) }}
			/>
			<div class="bg-brand/10 p-4 dark:bg-brand/15">
				<ChatMarkdown
					surface="brand"
					content={`> Quoted text on a user message.

1. A numbered item`}
				/>
			</div>
			<Calendar value={new CalendarDate(2026, 9, 6)} />
		</section>
		<section data-palette class="mt-8 flex max-w-xl flex-col gap-4">
			<div class="bg-brand/10 p-4 dark:bg-brand/15">
				<p class="text-brand-muted-foreground">Secondary text on a brand wash.</p>
			</div>
			<div class="bg-destructive/5 p-4">
				<p class="text-destructive-muted-foreground">The editor stopped rendering this note.</p>
				<pre
					class="bg-muted/50 text-destructive-muted-foreground">Source could not be rendered.</pre>
			</div>
		</section>
	</main>
</Tooltip.Provider>
