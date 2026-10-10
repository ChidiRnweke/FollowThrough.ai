import { SyncResourceRulesService } from '$lib/services/sync/state';
import type { WriteRebase } from '$lib/models/outbox';
import { WriteAncestry, type WriteAncestryController } from '$lib/controllers/sync/ancestry';
export const createWriteAncestry = <T>(rebase: WriteRebase<T>): WriteAncestryController<T> =>
	new WriteAncestry(new SyncResourceRulesService(), rebase);
