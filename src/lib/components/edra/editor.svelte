<script lang="ts">
	import TiptapContent from './TiptapContent.svelte';
	import './editor.css';
	import { MathBlock, MathInline, TableColMenu, TableRowMenu } from './index.js';

	interface Props {
		class: string;
	}
	const { class: className = '' }: Props = $props();
</script>

<MathBlock />
<MathInline />
<TableColMenu />
<TableRowMenu />
<TiptapContent class={className} />
