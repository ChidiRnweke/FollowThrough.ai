<script lang="ts">
	import Surface from './surface.svelte';
	import Carried from './carried.svelte';
</script>

<div class="flex flex-col gap-3">
	<Surface label="Release process · note" class="lg:self-start">
		<div class="flex flex-col gap-4 px-5 py-5">
			<p class="text-sm leading-relaxed">
				Every deliverable follows the same path.
				<Carried>
					A draft starts with the writer, goes to review, and only reaches the client once legal has
					signed off. Anything legal rejects returns to the writer.
				</Carried>
				We have not changed this since the audit.
			</p>
			<div class="flex items-center gap-2">
				<span
					class="inline-flex h-6 items-center rounded-4xl bg-brand/12 px-2.5 text-xs font-medium text-brand dark:bg-brand/20"
				>
					Selection → Diagram
				</span>
				<span class="provenance-caption">a skill, run on what you highlighted</span>
			</div>
		</div>
	</Surface>

	<Surface label="rendered in the note">
		<div class="overflow-x-auto px-5 py-6">
			<svg
				viewBox="0 0 460 176"
				class="h-auto w-full min-w-[380px]"
				role="img"
				aria-label="Flow diagram: Draft to Review to Legal to Client, with legal rejections returning to Draft"
			>
				<defs>
					<marker
						id="ft-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M0 0 L10 5 L0 10 z" class="fill-muted-foreground" />
					</marker>
					<marker
						id="ft-arrow-brand"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M0 0 L10 5 L0 10 z" class="fill-brand" />
					</marker>
				</defs>

				<!-- forward edges -->
				<line
					x1="96"
					y1="46"
					x2="122"
					y2="46"
					class="stroke-muted-foreground"
					stroke-width="1.5"
					marker-end="url(#ft-arrow)"
				/>
				<line
					x1="218"
					y1="46"
					x2="244"
					y2="46"
					class="stroke-muted-foreground"
					stroke-width="1.5"
					marker-end="url(#ft-arrow)"
				/>
				<line
					x1="332"
					y1="46"
					x2="358"
					y2="46"
					class="stroke-muted-foreground"
					stroke-width="1.5"
					marker-end="url(#ft-arrow)"
				/>

				<!-- rejection edge, the only coloured thing -->
				<path
					d="M288 68 L288 128 Q288 140 276 140 L52 140 Q40 140 40 128 L40 68"
					class="stroke-brand"
					stroke-width="1.5"
					fill="none"
					stroke-dasharray="4 4"
					marker-end="url(#ft-arrow-brand)"
				/>
				<text x="164" y="158" text-anchor="middle" class="fill-brand text-[11px]">rejected</text>

				<!-- nodes -->
				<g class="fill-card stroke-border" stroke-width="1">
					<rect x="8" y="26" width="88" height="40" rx="10" />
					<rect x="122" y="26" width="96" height="40" rx="10" />
					<rect x="244" y="26" width="88" height="40" rx="10" />
					<rect x="358" y="26" width="94" height="40" rx="10" />
				</g>
				<g class="fill-foreground text-xs" text-anchor="middle">
					<text x="52" y="51">Draft</text>
					<text x="170" y="51">Review</text>
					<text x="288" y="51">Legal</text>
					<text x="405" y="51">Client</text>
				</g>
			</svg>
		</div>
	</Surface>
</div>
