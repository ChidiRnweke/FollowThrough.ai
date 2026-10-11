<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { cn } from '$lib/utils.js';
	import * as Icon from '$lib/components/icons';
	import Tooltip from './Tooltip.svelte';
	import { commands, getEditor, useEditorTransaction } from './commands/index.js';

	const alignments = commands['alignment'];

	const editor = getEditor();
	const transaction = useEditorTransaction(editor);

	const isActive = () => {
		void transaction.version;
		return alignments.find((h) => h.isActive?.(editor)) !== undefined;
	};

	const AlignmentIcon = () => {
		void transaction.version;
		const h = alignments.find((h) => h.isActive?.(editor));
		return h ? h.icon : Icon.AlignLeft;
	};
</script>

<DropdownMenu.Root>
	<Tooltip tooltip="Alignment">
		<DropdownMenu.Trigger
			class={buttonVariants({
				variant: 'ghost',
				size: 'icon',
				class: cn(isActive() && 'bg-muted')
			})}
		>
			{@const Glyph = AlignmentIcon()}
			<Glyph />
			<Icon.ChevronDown class="text-muted-foreground size-2!" />
		</DropdownMenu.Trigger>
	</Tooltip>
	<DropdownMenu.Content
		class="w-fit"
		portalProps={{ to: editor.view.dom.parentElement ?? undefined }}
	>
		<DropdownMenu.Label>Alignments</DropdownMenu.Label>
		{#each alignments as alignment (alignment)}
			{@const Glyph = alignment.icon}
			<DropdownMenu.Item onclick={() => alignment.onClick?.(editor)}>
				<Glyph />
				{alignment.tooltip}
				<DropdownMenu.Shortcut>
					{alignment.shortCut}
				</DropdownMenu.Shortcut>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
