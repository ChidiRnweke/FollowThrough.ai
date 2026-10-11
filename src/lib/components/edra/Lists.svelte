<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { cn } from '$lib/utils.js';
	import * as Icon from '$lib/components/icons';
	import { commands, getEditor, useEditorTransaction } from './commands/index.js';
	import Tooltip from './Tooltip.svelte';

	const lists = commands['lists'];

	const editor = getEditor();
	const transaction = useEditorTransaction(editor);
	const isActive = () => {
		void transaction.version;
		return lists.some((h) => h.isActive?.(editor));
	};

	const ListIcon = () => {
		void transaction.version;
		const h = lists.find((h) => h.isActive?.(editor));
		return h ? h.icon : Icon.Minus;
	};
</script>

<DropdownMenu.Root>
	<Tooltip tooltip="Lists">
		{@const Glyph = ListIcon()}
		<DropdownMenu.Trigger
			class={buttonVariants({
				variant: 'ghost',
				size: 'icon',
				class: cn(isActive() && 'bg-muted')
			})}
		>
			<Glyph />
			<Icon.ChevronDown class="text-muted-foreground size-2!" />
		</DropdownMenu.Trigger>
	</Tooltip>
	<DropdownMenu.Content
		class="w-fit"
		portalProps={{ to: editor.view.dom.parentElement ?? undefined }}
	>
		<DropdownMenu.Label>Lists</DropdownMenu.Label>
		{#each lists as list (list)}
			{@const Glyph = list.icon}
			<DropdownMenu.Item onclick={() => list.onClick?.(editor)}>
				<Glyph />
				{list.tooltip}
				<DropdownMenu.Shortcut>{list.shortCut}</DropdownMenu.Shortcut>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
