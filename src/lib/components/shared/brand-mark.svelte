<script lang="ts">
	// FollowThrough product mark: flat teal tile with a continuous F-to-check
	// path (see DESIGN_SYSTEM.md "Product mark"). Inline so it follows the
	// semantic tokens in both color modes. Decorative by default — pair it
	// with visible text or pass an explicit label.
	let { class: className, label }: { class?: string; label?: string } = $props();
</script>

<svg
	class={className}
	viewBox="0 0 512 512"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<rect width="512" height="512" rx="112" class="fill-primary" />
	<path
		d="M344 126H154v260M154 254h132M246 334l58 58 104-146"
		fill="none"
		class="stroke-primary-foreground"
		stroke-width="46"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
