// Empty-state scenes in the Through-line style. Import as a namespace:
//   import * as Scene from '$lib/components/icons/scenes';  <EmptyState size="large" scene={Scene.Trash} … />
// A scene draws itself in when it mounts and its teal dot lands last: the dot marks the one action
// the empty region invites. See "Empty states" in docs/design/design-system.md.

export { default as Artifact } from './artifact.svelte';
export { default as Attachment } from './attachment.svelte';
export { default as Diagram } from './diagram.svelte';
export { default as Key } from './key.svelte';
export { default as Memory } from './memory.svelte';
export { default as Project } from './project.svelte';
export { default as Saved } from './saved.svelte';
export { default as Search } from './search.svelte';
export { default as Trash } from './trash.svelte';
export { default as Widget } from './widget.svelte';
