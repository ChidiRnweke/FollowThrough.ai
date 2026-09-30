import { wholeValueRebase } from '$lib/services/sync/rebase';
import { outboxRepositoryContract } from '../contracts/outbox-contract';
import { InMemoryOutbox } from './in-memory-outbox';
outboxRepositoryContract(() => new InMemoryOutbox<string, string>(wholeValueRebase<string>()));
