<script lang="ts">
	import TiptapContent from './TiptapContent.svelte';
	import './editor.css';
	import mermaid from 'mermaid';
	import { MathBlock, MathInline, TableColMenu, TableRowMenu } from './index.js';
	import { createMermaidConfig } from './mermaid-rendering.js';
	import { mode } from 'mode-watcher';

	interface Props {
		class: string;
	}
	const { class: className = '' }: Props = $props();

	mermaid.initialize(createMermaidConfig(mode.current === 'dark'));
</script>

<MathBlock />
<MathInline />
<TableColMenu />
<TableRowMenu />
<TiptapContent class={className} />
