<script lang="ts">
	import MemoryEntryList from '../memory-entry-list.svelte';
</script>

<!-- No inner measure: a `max-w-2xl` here sat inside the shell's own `max-w-5xl` header, so
     the title and the content it described did not share a right edge — and 42rem is not
     a width the design system names. The shell owns the reading measure. -->
<MemoryEntryList
	placeholder="Something about you the agent should always know — your role, goals, how you like to work…"
	emptyText="Nothing remembered about you yet."
	emptyHint="Add what the agent should always know, or tell it about yourself in chat."
	hideShare
	scopeLabel="Applies across every project"
	heroEmpty
/>
