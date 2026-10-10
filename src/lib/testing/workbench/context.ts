import { WorkbenchState } from '$lib/stores/workbench/state.svelte';
import { WorkbenchLifecycleState } from '$lib/stores/workbench/lifecycle';
import { WorkbenchPresentation } from '$lib/controllers/workbench/view';
import { WorkbenchLayout } from '$lib/controllers/workbench/layout';
import { WorkbenchNavigation } from '$lib/controllers/workbench/navigation';
import { WorkbenchTransitionService } from '$lib/services/workbench/transitions';
import { BrowserWorkbenchUrlCodec } from '$lib/client/workbench/url';
import { BrowserWorkbenchTabReader } from '$lib/client/workbench/tab-ref';
import {
	InMemoryWorkbenchStorage,
	InMemoryWorkbenchPreferences,
	InMemoryWorkbenchConversations
} from './fakes/in-memory-environment';
import type { InMemoryWorkbenchLayout } from './fakes/in-memory-layout';
import type { InMemoryWorkbenchRouter } from './fakes/in-memory-router';
export function createWorkbenchContext(
	router: InMemoryWorkbenchRouter,
	repository: InMemoryWorkbenchLayout
) {
	const state = new WorkbenchState();
	const lifecycle = new WorkbenchLifecycleState();
	const storage = new InMemoryWorkbenchStorage();
	const preferences = new InMemoryWorkbenchPreferences();
	const conversations = new InMemoryWorkbenchConversations();
	const codec = new BrowserWorkbenchUrlCodec();
	const tabs = new BrowserWorkbenchTabReader();
	const view = new WorkbenchPresentation(state, router, codec, tabs);
	const layout = new WorkbenchLayout(state, lifecycle, router, storage, preferences, codec, tabs);
	const navigation = new WorkbenchNavigation(
		state,
		lifecycle,
		view,
		layout,
		new WorkbenchTransitionService(),
		tabs
	);
	const attach = (next: InMemoryWorkbenchLayout) => {
		const account = String(storage.accounts.size);
		storage.accounts.set(account, next);
		return layout.attach(account, conversations);
	};
	const detach = attach(repository);
	return { state, view, layout, navigation, preferences, conversations, storage, attach, detach };
}
