<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="mx-auto max-w-md space-y-6 text-center">
		<h1 class="text-2xl font-bold">Account Pending Approval</h1>
		<p class="text-muted-foreground">
			Hi {data.user.displayName}, your account has been created but is awaiting administrator
			approval. You'll be able to access the app once your account is approved.
		</p>
		<form method="POST" action="/auth/logout">
			<Button type="submit">Sign Out</Button>
		</form>
	</div>
</div>
