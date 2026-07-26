<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { formatDateTime } from '$lib/components/app/labels';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
	import { toast } from 'svelte-sonner';
	import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
	import {
		initiateAttachmentUpload,
		completeAttachmentUpload,
		downloadAttachmentByPath,
		removeAttachmentByPath
	} from '$lib/remote/attachments.remote';
	import {
		setSkillEnabled,
		setSkillPinned,
		saveSkillBundle,
		saveSkillRaw,
		restoreSkillVersion
	} from '$lib/remote/skills.remote';

	let { data } = $props();
	let uploading = $state(false);

	// Remote forms carry no route params, so the skill's note id travels as a hidden field.
	const noteId = $derived(data.view.skill.note.id);
	const bundle = saveSkillBundle.fields;

	async function upload(file: File): Promise<void> {
		uploading = true;
		try {
			const intent = await initiateAttachmentUpload({
				noteId: data.view.skill.note.id,
				path: file.name,
				mediaType: file.type || 'application/octet-stream',
				byteSize: file.size,
				checksumSha256: await fileChecksumSha256(file)
			});
			const stored = await fetch(intent.uploadUrl, {
				method: 'PUT',
				headers: intent.requiredHeaders,
				body: file
			});
			if (!stored.ok) {
				const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
				throw new Error(
					detail
						? `Object storage rejected the upload: ${detail}`
						: `Object storage rejected the upload (${stored.status})`
				);
			}
			await completeAttachmentUpload({ uploadId: intent.upload.id });
			await invalidateAll();
			toast.success('Resource attached');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Upload failed');
		} finally {
			uploading = false;
		}
	}

	async function download(path: string): Promise<void> {
		try {
			const { url } = await downloadAttachmentByPath({ noteId: data.view.skill.note.id, path });
			window.open(url, '_blank', 'noopener,noreferrer');
		} catch {
			toast.error('Download link could not be created');
		}
	}
</script>

<PageShell title={data.view.skill.name} description={data.view.skill.description}>
	{#snippet actions()}
		<AgentAction action={agentActions.skillDetail} context={{ noteId: data.view.skill.note.id }} />
		<Button variant="outline" size="sm" href="/notes/{data.view.skill.note.id}">
			Edit as note
		</Button>
	{/snippet}
	<div class="flex flex-wrap gap-1.5">
		{#each data.view.skill.triggerHints as hint (hint)}
			<Badge variant="ghost" class="font-mono text-xs text-muted-foreground">{hint}</Badge>
		{/each}
		{#if !data.view.skill.isEnabled}
			<Badge variant="ghost" class="text-muted-foreground">Disabled</Badge>
		{/if}
	</div>
	<form {...setSkillEnabled}>
		<input {...setSkillEnabled.fields.noteId.as('hidden', noteId)} />
		<Button
			variant="outline"
			size="sm"
			{...setSkillEnabled.fields.enabled.as('submit', String(!data.view.skill.isEnabled))}
		>
			{data.view.skill.isEnabled ? 'Disable skill' : 'Enable skill'}
		</Button>
	</form>
	{#if data.projectPins.length > 0}
		<div class="flex flex-col gap-2 rounded-md border p-3">
			<p class="text-sm font-medium">Prioritize in projects</p>
			<div class="flex flex-wrap gap-2">
				{#each data.projectPins as item (item.project.id)}
					{@const pin = setSkillPinned.for(item.project.id)}
					<form {...pin}>
						<input {...pin.fields.noteId.as('hidden', noteId)} />
						<input {...pin.fields.projectId.as('hidden', item.project.id)} />
						<Button
							variant={item.pinned ? 'secondary' : 'outline'}
							size="sm"
							{...pin.fields.pinned.as('submit', String(!item.pinned))}
						>
							{item.project.name}{item.pinned ? ' · pinned' : ''}
						</Button>
					</form>
				{/each}
			</div>
		</div>
	{/if}
	<Separator />
	<section class="flex flex-col gap-3">
		<div>
			<h2 class="section-title">Skill bundle</h2>
			<p class="text-sm text-muted-foreground">
				One canonical SKILL.md representation. Scripts are stored as resources and are never
				executed.
			</p>
		</div>
		<form {...saveSkillBundle} class="grid gap-3 sm:grid-cols-2">
			<input {...bundle.noteId.as('hidden', noteId)} />
			<label class="grid gap-1 text-sm">
				<span>Display name</span>
				<input
					class="rounded-md border bg-background px-3 py-2"
					{...bundle.displayName.as('text', data.view.skill.name)}
				/>
			</label>
			<label class="grid gap-1 text-sm">
				<span>Portable name</span>
				<input
					class="rounded-md border bg-background px-3 py-2 font-mono"
					{...bundle.slug.as('text', data.view.skill.slug ?? '')}
					required
				/>
			</label>
			<label class="grid gap-1 text-sm sm:col-span-2">
				<span>Description</span>
				<textarea
					class="min-h-20 rounded-md border bg-background p-3"
					{...bundle.description.as('text', data.view.skill.description)}
					required></textarea>
			</label>
			<label class="grid gap-1 text-sm">
				<span>License</span>
				<input
					class="rounded-md border bg-background px-3 py-2"
					{...bundle.license.as('text', data.view.skill.license ?? '')}
				/>
			</label>
			<label class="grid gap-1 text-sm">
				<span>Compatibility</span>
				<input
					class="rounded-md border bg-background px-3 py-2"
					{...bundle.compatibility.as('text', data.view.skill.compatibility ?? '')}
				/>
			</label>
			<label class="grid gap-1 text-sm sm:col-span-2">
				<span>Trigger hints <span class="text-muted-foreground">(comma-separated)</span></span>
				<input
					class="rounded-md border bg-background px-3 py-2"
					{...bundle.triggerHints.as('text', data.view.skill.triggerHints.join(', '))}
				/>
			</label>
			<label class="grid gap-1 text-sm sm:col-span-2">
				<span>Instructions</span>
				<textarea
					class="min-h-72 rounded-md border bg-background p-3 font-mono text-xs"
					{...bundle.instructions.as('text', data.view.skill.note.plainText)}></textarea>
			</label>
			<label class="grid gap-1 text-sm sm:col-span-2">
				<span>Metadata <span class="text-muted-foreground">(JSON string map)</span></span>
				<textarea
					class="min-h-24 rounded-md border bg-background p-3 font-mono text-xs"
					{...bundle.metadata.as('text', JSON.stringify(data.view.skill.metadata ?? {}, null, 2))}
				></textarea>
			</label>
			<label class="flex items-center gap-2 text-sm sm:col-span-2">
				<input
					{...bundle.allowImplicitInvocation.as('checkbox')}
					checked={data.view.skill.allowImplicitInvocation !== false}
				/>
				Allow automatic discovery from prompt relevance
			</label>
			{#each bundle.allIssues() ?? [] as issue (issue.message)}
				<p class="text-sm text-destructive sm:col-span-2">{issue.message}</p>
			{/each}
			<div class="sm:col-span-2"><Button type="submit" size="sm">Save bundle</Button></div>
		</form>
		<details class="rounded-md border p-3">
			<summary class="cursor-pointer text-sm font-medium">Raw SKILL.md</summary>
			<form {...saveSkillRaw} class="mt-3 flex flex-col gap-3">
				<input {...saveSkillRaw.fields.noteId.as('hidden', noteId)} />
				<input {...saveSkillRaw.fields.displayName.as('hidden', data.view.skill.name)} />
				<label class="grid gap-1 text-sm">
					<span class="sr-only">Raw SKILL.md</span>
					<textarea
						class="min-h-96 rounded-md border bg-background p-3 font-mono text-xs"
						{...saveSkillRaw.fields.raw.as('text', data.raw)}></textarea>
				</label>
				{#each saveSkillRaw.fields.allIssues() ?? [] as issue (issue.message)}
					<p class="text-sm text-destructive">{issue.message}</p>
				{/each}
				<div><Button type="submit" variant="outline" size="sm">Save raw bundle</Button></div>
			</form>
		</details>
	</section>
	<Separator />
	<section class="flex flex-col gap-3">
		<div>
			<h2 class="section-title">Bundle resources</h2>
			<p class="text-sm text-muted-foreground">
				Text, source, and PDF files can be read by the agent. Scripts are resources only and are
				never executed.
			</p>
		</div>
		<label
			class="tactile inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
		>
			{uploading ? 'Uploading…' : 'Attach resource'}
			<input
				type="file"
				class="sr-only"
				disabled={uploading}
				onchange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file) void upload(file);
					event.currentTarget.value = '';
				}}
			/>
		</label>
		<div class="divide-y rounded-md border">
			{#each data.attachments as item (item.attachment.id)}
				{@const removal = removeAttachmentByPath.for(item.attachment.id)}
				<div class="flex items-center justify-between gap-3 p-3 text-sm">
					<div class="min-w-0">
						<p class="truncate font-mono text-xs">{item.attachment.path}</p>
						<p class="text-xs text-muted-foreground">
							{item.version.mediaType} · {item.version.byteSize} bytes
							{item.version.parserKind
								? ` · readable as ${item.version.parserKind}`
								: ' · download only'}
						</p>
					</div>
					<div class="flex gap-2">
						<Button variant="ghost" size="sm" onclick={() => void download(item.attachment.path)}
							>Download</Button
						>
						<form {...removal}>
							<input {...removal.fields.noteId.as('hidden', noteId)} />
							<Button
								variant="ghost"
								size="sm"
								{...removal.fields.path.as('submit', item.attachment.path)}>Remove</Button
							>
						</form>
					</div>
				</div>
			{:else}
				<p class="p-3 text-sm text-muted-foreground">No resources attached.</p>
			{/each}
		</div>
	</section>
	<Separator />
	<section class="flex flex-col gap-2">
		<h2 class="section-title">Where the agent used it</h2>
		{#each data.view.usages as usage (usage.usage.id)}
			<div class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
				{#if usage.contextNote}
					<a href="/notes/{usage.contextNote.id}" class="hover:underline">
						{usage.contextNote.title}
					</a>
				{:else}
					<span class="text-muted-foreground">Chat session</span>
				{/if}
				<span class="text-xs text-muted-foreground">{formatDateTime(usage.usage.createdAt)}</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Not used yet. It will be loaded when a prompt matches its trigger hints.
			</p>
		{/each}
	</section>
	<Separator />
	<section class="flex flex-col gap-2">
		<h2 class="section-title">Version history</h2>
		{#each [...data.versions].reverse() as version (version.id)}
			<div class="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
				<div>
					<p>Revision {version.revision}</p>
					<p class="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</p>
				</div>
				{#if version.revision !== data.view.skill.note.currentRevision}
					{@const restore = restoreSkillVersion.for(version.id)}
					<form {...restore}>
						<input {...restore.fields.noteId.as('hidden', noteId)} />
						<Button
							variant="outline"
							size="sm"
							{...restore.fields.revision.as('submit', version.revision)}
						>
							Restore
						</Button>
					</form>
				{:else}
					<Badge variant="secondary">Current</Badge>
				{/if}
			</div>
		{/each}
	</section>
</PageShell>
