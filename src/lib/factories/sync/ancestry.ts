import { WriteAncestry, type WriteAncestryController } from '$lib/controllers/sync/ancestry';
import type { WriteRebase } from '$lib/models/outbox';
import { WriteAncestryService } from '$lib/services/sync/ancestry';
export const createWriteAncestry = <T>(rebase: WriteRebase<T>): WriteAncestryController<T> =>
	new WriteAncestry(rebase, new WriteAncestryService());
