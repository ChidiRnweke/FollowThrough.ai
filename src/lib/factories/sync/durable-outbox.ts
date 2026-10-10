import { DurableOutbox } from '$lib/controllers/sync/durable-outbox';
import type { DurableWriteController } from '$lib/controllers/sync/submission';
import type { OutboxStorage } from '$lib/models/browser-workspace';
import type { WriteRebase } from '$lib/models/outbox';
import { OutboxDeliveryService, OutboxEditingService } from '$lib/services/sync/state';
import { createWriteAncestry } from './ancestry';
export const createDurableOutbox = <C, T>(
	storage: OutboxStorage<C, T>,
	rebase: WriteRebase<T>
): DurableWriteController<C, T> =>
	new DurableOutbox(
		storage,
		createWriteAncestry(rebase),
		new OutboxEditingService(),
		new OutboxDeliveryService()
	);
