import type {
	WorkbenchConversations,
	WorkbenchLayoutRepository
} from '$lib/controllers/workbench/contracts';
/** Retained operation state is scoped to a binding, not to a controller instance. */
export class WorkbenchLifecycleState {
	binding:
		| {
				readonly repository: WorkbenchLayoutRepository;
				readonly conversations: WorkbenchConversations;
		  }
		| undefined;
	generation = 0;
	hydrated = false;
	/** Hold across last-tab navigation so the old URL cannot repopulate the emptied strip. */
	applyingFromUrl = false;
	/** A pending initial read must not be overwritten by URL reconciliation. */
	restoring = false;
	/** Avoid reentrant pruning when its navigation reruns shell reconciliation. */
	pruning = false;
}
