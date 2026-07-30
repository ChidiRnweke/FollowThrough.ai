import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Snippet } from 'svelte';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export interface AtomicOperation {
	run<T>(work: () => Promise<T>): Promise<T>;
}

export class DeferredValue<T> {
	private value: T | undefined;

	constructor(private readonly create: () => T) {}

	get(): T {
		return (this.value ??= this.create());
	}
}

export class LateValue<T> {
	private value: T | undefined;

	set(value: T): void {
		this.value = value;
	}

	get(): T {
		if (this.value === undefined) throw new Error('Late-bound value is not initialized');
		return this.value;
	}
}

export function safeReturnUrl(value: string | null, fallback = '/todos'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	try {
		const url = new URL(value, 'https://followthrough.local');
		if (url.origin !== 'https://followthrough.local') return fallback;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return fallback;
	}
}

interface CookieJar {
	get(name: string): string | undefined;
	set(
		name: string,
		value: string,
		options: {
			path: string;
			httpOnly: boolean;
			secure: boolean;
			sameSite: 'lax';
			maxAge: number;
		}
	): void;
	delete(name: string, options: { path: string }): void;
}

export const getSessionCookie = (cookies: Pick<CookieJar, 'get'>): string | null =>
	cookies.get('session') ?? null;

export function setSessionCookie(
	cookies: Pick<CookieJar, 'set'>,
	sessionId: string,
	secure: boolean
) {
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});
}

export const deleteSessionCookie = (cookies: Pick<CookieJar, 'delete'>): void => {
	cookies.delete('session', { path: '/' });
};

export function getPkceCookie(
	cookies: Pick<CookieJar, 'get'>,
	state: string
): { codeVerifier: string; state: string } | null {
	const data = cookies.get(`oauth_${state}`);
	if (!data) return null;
	try {
		return JSON.parse(data) as { codeVerifier: string; state: string };
	} catch {
		return null;
	}
}

export function setPkceCookie(
	cookies: Pick<CookieJar, 'set'>,
	state: string,
	codeVerifier: string,
	secure: boolean
) {
	cookies.set(`oauth_${state}`, JSON.stringify({ codeVerifier, state }), {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: 60 * 10
	});
}

export const deletePkceCookie = (cookies: Pick<CookieJar, 'delete'>, state: string): void => {
	cookies.delete(`oauth_${state}`, { path: '/' });
};

/**
 * Flatten an error and its `cause` chain into one log line.
 */
export function describeError(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	const seen = new Set<object>();
	while (current !== undefined && current !== null) {
		if (typeof current === 'object') {
			if (seen.has(current)) break;
			seen.add(current);
		}
		if (current instanceof Error) {
			const code = (current as { code?: unknown }).code;
			parts.push(
				`${current.name}: ${current.message}${typeof code === 'string' ? ` (${code})` : ''}`
			);
			current = current.cause;
		} else {
			parts.push(String(current));
			break;
		}
	}
	return parts.join(' <- ');
}

export const levenshtein = (a: string, b: string): number => {
	const rows = a.length + 1;
	const cols = b.length + 1;
	let previous = Array.from({ length: cols }, (_, index) => index);
	for (let row = 1; row < rows; row++) {
		const current = [row];
		for (let column = 1; column < cols; column++) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			current[column] = Math.min(
				current[column - 1]! + 1,
				previous[column]! + 1,
				previous[column - 1]! + cost
			);
		}
		previous = current;
	}
	return previous[cols - 1]!;
};

export interface ToolNameSuggestion {
	readonly name: string;
	readonly distance: number;
}

export const suggestToolNames = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): readonly ToolNameSuggestion[] =>
	[...new Set(names)]
		.map((name) => ({ name, distance: levenshtein(query, name) }))
		.filter((suggestion) => suggestion.distance <= maxDistance)
		.sort(
			(left, right) =>
				left.distance - right.distance ||
				(left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
		);

export type ToolNameMatch =
	| { readonly kind: 'exact'; readonly name: string }
	| { readonly kind: 'suggestion'; readonly name: string }
	| { readonly kind: 'none' };

export const matchToolName = (
	query: string,
	names: readonly string[],
	maxDistance = 3
): ToolNameMatch => {
	if (names.includes(query)) return { kind: 'exact', name: query };
	const [best] = suggestToolNames(query, names, maxDistance);
	return best ? { kind: 'suggestion', name: best.name } : { kind: 'none' };
};

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
