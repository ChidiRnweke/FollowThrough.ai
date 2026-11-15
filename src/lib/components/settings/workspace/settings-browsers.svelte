<script lang="ts">
	import type { SignedInBrowser } from '$lib/models/identity';
	import type { DateTime } from '$lib/models/workspace';
	import { toast } from 'svelte-sonner';
	import {
		listSignedInBrowsers,
		signOutBrowser,
		signOutOtherBrowsers
	} from '$lib/remote/settings/settings.remote';
	import { formatDateTime } from '$lib/components/shared/labels';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let busy = $state(false);

	/** This browser leads; the others keep the server's newest-first order. */
	const ordered = (browsers: readonly SignedInBrowser[]): SignedInBrowser[] =>
		[...browsers].sort((a, b) => Number(b.current) - Number(a.current));

	const caption = (browser: SignedInBrowser): string =>
		[
			browser.lastRenewedAt && `Renewed ${formatDateTime(browser.lastRenewedAt)}`,
			`Expires ${formatDateTime(browser.expiresAt.toISOString() as DateTime)}`
		]
			.filter(Boolean)
			.join(' · ');

	async function signOut(browser: SignedInBrowser): Promise<void> {
		busy = true;
		try {
			await signOutBrowser(browser.id);
			toast.success('Signed out the browser');
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the browser remains listed.
		} catch {
			toast.error('Could not sign out the browser. Try again.');
		} finally {
			busy = false;
		}
	}

	async function signOutOthers(): Promise<void> {
		busy = true;
		try {
			const signedOut = await signOutOtherBrowsers();
			toast.success(
				signedOut === 1 ? 'Signed out 1 other browser' : `Signed out ${signedOut} other browsers`
			);
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the browsers remain listed.
		} catch {
			toast.error('Could not sign out the other browsers. Try again.');
		} finally {
			busy = false;
		}
	}
</script>

<!-- Each row is a session, named by when it started: no device details are stored. A row's id
     is the digest of its session token, never the token. -->
<section class="flex max-w-3xl flex-col gap-section">
	<p class="text-sm text-muted-foreground">
		Each browser you sign in with stays signed in while you use it, up to a fixed limit after you
		signed in. Sign out a browser you no longer use or do not recognize; it asks for sign-in on its
		next visit.
	</p>

	<svelte:boundary>
		{#snippet pending()}
			<p class="text-sm text-muted-foreground">Loading signed-in browsers…</p>
		{/snippet}
		{@const browsers = await listSignedInBrowsers()}
		<div class="flex flex-col gap-group">
			<!-- The eyebrow sits a `row` step above its list, as on the project overview. -->
			<section class="flex flex-col gap-row">
				<h3 class="eyebrow">Signed-in browsers</h3>
				<!-- Bled 12px past the measure so the text keeps the page's left edge while the
				     hairlines still read as one continuous list. -->
				<ul class="-mx-3 divide-y divide-border border-y border-border">
					{#each ordered(browsers) as browser (browser.id)}
						<li class="flex items-center justify-between gap-4 px-3 py-3">
							<div class="flex min-w-0 flex-col gap-bind">
								<p class="truncate text-sm font-medium">
									Signed in {formatDateTime(browser.createdAt)}
								</p>
								<p class="provenance-caption">{caption(browser)}</p>
							</div>
							{#if browser.current}
								<Badge variant="brand" class="shrink-0">This browser</Badge>
							{:else}
								<Button
									variant="ghost"
									class="shrink-0"
									disabled={busy}
									onclick={() => void signOut(browser)}
								>
									Sign out
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
			{#if browsers.some((browser) => !browser.current)}
				<div>
					<Button variant="outline" disabled={busy} onclick={() => void signOutOthers()}>
						Sign out other browsers
					</Button>
				</div>
			{/if}
		</div>

		{#snippet failed(_error, reset)}
			<div
				role="alert"
				class="flex flex-col items-start gap-row rounded-md border border-destructive/30 bg-destructive/5 p-4"
			>
				<p class="text-sm text-destructive">Could not load signed-in browsers.</p>
				<!-- Refresh the query before resetting. A repeated failure returns to this notice. -->
				<Button
					variant="outline"
					size="sm"
					onclick={() => void listSignedInBrowsers().refresh().then(reset, reset)}
				>
					Try again
				</Button>
			</div>
		{/snippet}
	</svelte:boundary>
</section>
