<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';
	export const inputGroupAddonVariants = tv({
		// The addon turns teal with the field it sits in: the group paints a solid teal border,
		// halo and wash on focus, and a leading search or currency glyph left at muted grey reads
		// as a dead spot in the middle of that wash.
		base: "text-muted-foreground group-has-[[data-slot=input-group-control]:focus-visible]/input-group:text-primary **:data-[slot=kbd]:bg-muted-foreground/10 h-auto gap-2 py-2 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 **:data-[slot=kbd]:rounded-4xl **:data-[slot=kbd]:px-1.5 [&>svg:not([class*='size-'])]:size-4 flex cursor-text items-center justify-center transition-colors select-none",
		variants: {
			align: {
				'inline-start': 'pl-3 has-[>button]:-ml-1 has-[>kbd]:ml-[-0.15rem] order-first',
				'inline-end': 'pr-3 has-[>button]:-mr-1 has-[>kbd]:mr-[-0.15rem] order-last',
				'block-start':
					'px-3 pt-3 group-has-[>input]/input-group:pt-3 [.border-b]:pb-3 order-first w-full justify-start',
				'block-end':
					'px-3 pb-3 group-has-[>input]/input-group:pb-3 [.border-t]:pt-3 order-last w-full justify-start'
			}
		},
		defaultVariants: {
			align: 'inline-start'
		}
	});

	export type InputGroupAddonAlign = VariantProps<typeof inputGroupAddonVariants>['align'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(),
		class: className,
		children,
		align = 'inline-start',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		align?: InputGroupAddonAlign;
	} = $props();

	const isButtonTarget = (target: EventTarget | null, boundary: HTMLElement): boolean => {
		for (
			let element = target instanceof HTMLElement ? target : null;
			element;
			element = element.parentElement
		) {
			if (element instanceof HTMLButtonElement) return true;
			if (element === boundary) return false;
		}
		return false;
	};

	const firstInput = (root: HTMLElement | null): HTMLInputElement | undefined => {
		if (!root) return undefined;
		const pending = [...root.children];
		while (pending.length > 0) {
			const element = pending.shift();
			if (element instanceof HTMLInputElement) return element;
			if (element) pending.unshift(...element.children);
		}
		return undefined;
	};
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="input-group-addon"
	data-align={align}
	class={cn(inputGroupAddonVariants({ align }), className)}
	onclick={(e) => {
		if (isButtonTarget(e.target, e.currentTarget)) return;
		firstInput(e.currentTarget.parentElement)?.focus();
	}}
	{...restProps}
>
	{@render children?.()}
</div>
