<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { FtLoader as LoaderCircle, FtRefresh as RotateCcw } from '$lib/components/icons';
	import {
		BrowserDrawioEmbedPort,
		DRAWIO_EMBED_URL,
		DrawioEmbedAdapter,
		type DrawioExport,
		type DrawioExportReason
	} from '$lib/client/drawio/embed-adapter';

	let {
		xml,
		title,
		commitLabel = 'Save',
		commitReason = 'save',
		oncommit,
		onclose,
		onmodifiedchange
	}: {
		xml: string;
		title: string;
		commitLabel?: string;
		commitReason?: DrawioExportReason;
		oncommit: (output: DrawioExport) => Promise<void>;
		onclose?: () => void;
		onmodifiedchange?: (modified: boolean) => void;
	} = $props();

	let iframe = $state<HTMLIFrameElement | null>(null);
	let adapter: DrawioEmbedAdapter | undefined;
	let phase = $state<'loading' | 'ready' | 'exporting' | 'saving' | 'saved' | 'failed'>('loading');
	let failure = $state('');
	let modified = $state(false);

	const status = $derived(
		phase === 'loading'
			? 'Loading draw.io editor…'
			: phase === 'exporting'
				? 'Preparing diagram…'
				: phase === 'saving'
					? 'Saving diagram…'
					: phase === 'saved'
						? 'Diagram saved'
						: phase === 'failed'
							? failure
							: modified
								? 'Unsaved diagram changes'
								: 'Draw.io editor ready'
	);

	onMount(() => {
		adapter = new DrawioEmbedAdapter(new BrowserDrawioEmbedPort(window, () => iframe), {
			onLoading: () => {
				phase = 'loading';
				failure = '';
			},
			onLoaded: () => {
				phase = 'ready';
			},
			onModified: (value) => {
				modified = value;
				onmodifiedchange?.(value);
				if (phase === 'saved') phase = 'ready';
			},
			onExport: (output) => void persist(output),
			onExit: (isModified) => {
				modified = isModified;
				onmodifiedchange?.(isModified);
				requestClose();
			},
			onFailure: (message) => {
				failure = message;
				phase = 'failed';
			}
		});
		adapter.start({ xml, title });
	});

	onDestroy(() => adapter?.stop());

	async function persist(output: DrawioExport): Promise<void> {
		phase = 'saving';
		failure = '';
		try {
			await oncommit(output);
			modified = false;
			onmodifiedchange?.(false);
			phase = 'saved';
			if (output.exit) onclose?.();
		} catch (error) {
			failure = error instanceof Error ? error.message : 'The diagram could not be saved.';
			phase = 'failed';
		}
	}

	function commit(): void {
		if (!adapter || phase === 'exporting' || phase === 'saving') return;
		phase = 'exporting';
		failure = '';
		adapter.requestExport(commitReason);
	}

	function retry(): void {
		failure = '';
		phase = 'loading';
		adapter?.retry();
	}

	function requestClose(): void {
		if (modified && !window.confirm('Leave without saving your diagram changes?')) return;
		onclose?.();
	}

	function onbeforeunload(event: BeforeUnloadEvent): void {
		if (modified) event.preventDefault();
	}

	beforeNavigate((navigation) => {
		if (modified && !window.confirm('Leave without saving your diagram changes?')) {
			navigation.cancel();
		}
	});
</script>

<svelte:window {onbeforeunload} />

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<div class="flex min-h-8 flex-wrap items-center gap-2 border-b border-border pb-3">
		<p class="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
		<p
			class={phase === 'failed' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
			role="status"
			aria-live="polite"
		>
			{status}
		</p>
		{#if phase === 'failed'}
			<Button variant="outline" size="sm" onclick={retry}>
				<RotateCcw />
				Retry
			</Button>
		{/if}
		{#if onclose}
			<Button variant="ghost" size="sm" onclick={requestClose}>Close</Button>
		{/if}
		<Button
			disabled={phase === 'loading' || phase === 'exporting' || phase === 'saving'}
			onclick={commit}
		>
			{#if phase === 'exporting' || phase === 'saving'}
				<LoaderCircle class="animate-spin" />
			{/if}
			{commitLabel}
		</Button>
	</div>

	<div
		class="relative min-h-96 flex-1 overflow-hidden rounded-md border border-border bg-background"
	>
		{#if phase === 'loading'}
			<div class="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
				<LoaderCircle
					class="size-5 animate-spin text-muted-foreground"
					aria-label="Loading draw.io"
				/>
			</div>
		{/if}
		<iframe
			bind:this={iframe}
			src={DRAWIO_EMBED_URL}
			class="size-full min-h-96 border-0"
			title={`draw.io editor for ${title}`}
			sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"
			allow="clipboard-read; clipboard-write"
			referrerpolicy="no-referrer"
		></iframe>
	</div>
</div>
