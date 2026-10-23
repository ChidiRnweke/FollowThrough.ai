import type { ClipRecord } from './recorder.ts';

/** What a recording leaves for the composition: the clips, their marks and the pointer log. */
export interface FilmManifest {
	readonly recordedAt: string;
	readonly viewport: { readonly width: number; readonly height: number };
	readonly scale: number;
	readonly fps: number;
	readonly clips: readonly (ClipRecord & { readonly caption: string })[];
}
