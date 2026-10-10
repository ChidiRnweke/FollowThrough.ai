import { WorkbenchState } from '$lib/stores/workbench/state.svelte';
import { WorkbenchLifecycleState } from '$lib/stores/workbench/lifecycle';
import { WorkbenchLayout } from '$lib/controllers/workbench/layout';
import { WorkbenchNavigation } from '$lib/controllers/workbench/navigation';
import { WorkbenchPresentation } from '$lib/controllers/workbench/view';
import type { WorkbenchView } from '$lib/models/workbench';
import type {
	WorkbenchLayoutController,
	WorkbenchNavigationController
} from '$lib/controllers/workbench/contracts';
import { WorkbenchTransitionService } from '$lib/services/workbench/transitions';
import {
	BrowserWorkbenchPreferences,
	BrowserWorkbenchRouter,
	BrowserWorkbenchStorage
} from '$lib/client/workbench/browser';
import { BrowserWorkbenchUrlCodec } from '$lib/client/workbench/url';
import { BrowserWorkbenchTabReader } from '$lib/client/workbench/tab-ref';
import { WorkbenchShell, type WorkbenchShellController } from '$lib/controllers/workbench/shell';

const state = new WorkbenchState();
const lifecycle = new WorkbenchLifecycleState();
const router = new BrowserWorkbenchRouter();
const codec = new BrowserWorkbenchUrlCodec();
const tabs = new BrowserWorkbenchTabReader();
export const workbench: WorkbenchView = new WorkbenchPresentation(state, router, codec, tabs);
const layout = new WorkbenchLayout(
	state,
	lifecycle,
	router,
	new BrowserWorkbenchStorage(),
	new BrowserWorkbenchPreferences(),
	codec,
	tabs
);
export const workbenchLayout: WorkbenchLayoutController = layout;
const navigation = new WorkbenchNavigation(
	state,
	lifecycle,
	workbench,
	layout,
	new WorkbenchTransitionService(),
	tabs
);

export const workbenchNavigation: WorkbenchNavigationController = navigation;
export const workbenchShell: WorkbenchShellController = new WorkbenchShell(
	layout,
	navigation,
	tabs
);
