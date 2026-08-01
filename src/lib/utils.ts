import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Snippet } from 'svelte';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// The symbol slot holds Svelte attachments, whose element type varies per trigger.
// `unknown` there would not satisfy `Attachment<HTMLButtonElement>` at the spread site.
type AnyProps = {
	[key: string]: unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: symbol]: any;
};

/**
 * Combine prop bags from two headless primitives onto one element — e.g. a button that
 * is both a `Tip` trigger and a `DropdownMenu.Trigger`.
 *
 * Iterating with `Reflect.ownKeys` rather than `Object.entries` is load-bearing: bits-ui
 * captures each trigger's element through a Svelte attachment stored under a unique
 * *symbol* key. Enumerating string keys only would drop those attachments, and the
 * primitive would silently never learn about its own node — the menu stops opening and
 * the tooltip stops appearing. Attachment keys never collide, so they all survive.
 *
 * Colliding event handlers are chained (a plain spread would let the later bag drop the
 * earlier one's `onpointerdown`), `class` merges through `cn`, and `style` concatenates.
 * Anything else is last-wins, including `id` — one element can only carry one, and both
 * primitives track their node via the attachment rather than the id.
 */
export function mergeProps(...bags: (AnyProps | undefined)[]): AnyProps {
	const merged: AnyProps = {};
	for (const bag of bags) {
		if (!bag) continue;
		for (const key of Reflect.ownKeys(bag)) {
			const value = bag[key as keyof typeof bag];
			const existing = merged[key];
			if (key === 'class') {
				merged[key] = cn(existing as ClassValue, value as ClassValue);
			} else if (key === 'style' && typeof existing === 'string' && typeof value === 'string') {
				merged[key] = `${existing.replace(/;\s*$/, '')}; ${value}`;
			} else if (
				typeof key === 'string' &&
				/^on[a-z]/.test(key) &&
				typeof existing === 'function' &&
				typeof value === 'function'
			) {
				merged[key] = (...args: unknown[]) => {
					(existing as (...a: unknown[]) => unknown)(...args);
					return (value as (...a: unknown[]) => unknown)(...args);
				};
			} else {
				merged[key] = value;
			}
		}
	}
	return merged;
}

export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & { ref?: E | null };
export type WithoutChild<T> = Omit<T, 'child'>;
export type WithoutChildren<T> = Omit<T, 'children'>;
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
export type WithChild<T> = T & { child?: Snippet };
