import { goto } from '$app/navigation';
import { page } from '$app/state';
import { toast } from 'svelte-sonner';
import type {
	WorkbenchRouter,
	WorkbenchPreferences,
	WorkbenchStorage,
	WorkbenchLayoutRepository
} from '$lib/controllers/workbench/contracts';
import { IndexedDbWorkbenchLayout } from './indexeddb-layout';
const STRIP_KEY = 'followthrough.workbench.stripHidden';
const RATIO_KEY = 'followthrough.workbench.splitRatio';
export class BrowserWorkbenchRouter implements WorkbenchRouter {
	goto(url: string, options?: { replaceState?: boolean; noScroll?: boolean }): Promise<void> {
		return goto(url, options);
	}
	currentUrl(): URL {
		return page.url;
	}
}
export class BrowserWorkbenchPreferences implements WorkbenchPreferences {
	read(): { stripHidden: boolean | undefined; splitRatio: number | undefined } {
		if (typeof localStorage === 'undefined')
			return { stripHidden: undefined, splitRatio: undefined };
		const hidden = localStorage.getItem(STRIP_KEY);
		const ratio = Number.parseFloat(localStorage.getItem(RATIO_KEY) ?? '');
		return {
			stripHidden: hidden === 'true' ? true : hidden === 'false' ? false : undefined,
			splitRatio: Number.isFinite(ratio) ? Math.min(0.75, Math.max(0.25, ratio)) : undefined
		};
	}
	writeStripHidden(value: boolean): void {
		if (typeof localStorage !== 'undefined') localStorage.setItem(STRIP_KEY, String(value));
	}
	writeSplitRatio(value: number): void {
		if (typeof localStorage !== 'undefined') localStorage.setItem(RATIO_KEY, String(value));
	}
	report(error: Error): void {
		toast.error(error.message);
	}
}
export class BrowserWorkbenchStorage implements WorkbenchStorage {
	open(accountId: string): WorkbenchLayoutRepository {
		return new IndexedDbWorkbenchLayout(accountId);
	}
}
