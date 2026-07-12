<script lang="ts">
	import type { Editor } from './commands/CoreEditor.js';
	import { setEditor } from './commands/editorContext.js';
	import type { Snippet } from 'svelte';

	let { editor, children }: { editor: Editor | undefined; children?: Snippet } = $props();

	// svelte-ignore state_referenced_locally
	if (editor) {
		setEditor(editor);
	}
</script>

{#if editor && children}
	{@render children()}
{/if}
