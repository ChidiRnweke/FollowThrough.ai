<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<!--
	Placeholder for a conversation whose transcript is still loading. It mirrors
	the thread's reading shape — a user question held on the right, an answer
	running flush left — without implying any of the loading content is real.
-->
<div role="status" aria-label="Loading conversation" class="flex flex-col gap-6">
	<span class="sr-only">Loading conversation</span>
	<div aria-hidden="true" class="flex flex-col gap-6">
		<div class="flex justify-end">
			<div class="flex max-w-80 flex-col gap-2 rounded-xl bg-muted/70 px-3 py-2">
				<Skeleton class="h-3.5 w-44 bg-muted" />
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<Skeleton class="h-3.5 w-full" />
			<Skeleton class="h-3.5 w-5/6" />
			<Skeleton class="h-3.5 w-4/6" />
		</div>
		<div class="flex justify-end">
			<div class="flex max-w-80 flex-col gap-2 rounded-xl bg-muted/70 px-3 py-2">
				<Skeleton class="h-3.5 w-32 bg-muted" />
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<div class="flex w-2/3 flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
				<Skeleton class="h-3 w-full" />
				<Skeleton class="h-3 w-1/2" />
			</div>
			<Skeleton class="h-3.5 w-full" />
			<Skeleton class="h-3.5 w-3/4" />
		</div>
	</div>
</div>
