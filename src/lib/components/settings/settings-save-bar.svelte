<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';

	let {
		dirty,
		saving,
		onundo
	}: {
		dirty: boolean;
		saving: boolean;
		onundo: () => void;
	} = $props();
</script>

<!-- The form's last child, so a short form shows it right under the fields and a long one keeps
     it pinned to the bottom of the window. It exists only while there is something to save. The
     mt-2 steps it out to 32px, like the preamble's pb-2, so it does not read as part of the last
     field. -->
{#if dirty}
	<div
		class="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-background py-3 dark:bg-card"
	>
		<span class="text-xs text-muted-foreground" aria-live="polite">Unsaved changes</span>
		<div class="flex items-center gap-2">
			<Button type="button" variant="outline" disabled={saving} onclick={onundo}>
				<Icon.Undo data-icon="inline-start" />Undo
			</Button>
			<Button type="submit" disabled={saving}>Save</Button>
		</div>
	</div>
{/if}
