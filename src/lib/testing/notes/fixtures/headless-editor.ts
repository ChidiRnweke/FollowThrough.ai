import type { Extensions } from '@tiptap/core';
import editorExtensions from '$lib/components/edra/commands/extensions';
import { noteNodeExtensions } from '$lib/infrastructure/notes/schema/extensions';

/** The editor's behavior and the full note schema, without the Svelte node views. */
export const headlessEditorExtensions: Extensions = [...editorExtensions, ...noteNodeExtensions];
