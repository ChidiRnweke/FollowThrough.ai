<script lang="ts">
	// `Command.Input` reads the command context, so it cannot be rendered on its own.
	import Command from './command.svelte';
	import CommandInput from './command-input.svelte';
</script>

<Command>
	<CommandInput placeholder="Search models…" />
</Command>
