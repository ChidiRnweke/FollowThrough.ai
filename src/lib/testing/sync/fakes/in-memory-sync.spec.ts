import { cacheRepositoryContract } from '../contracts/cache-contract';
import { InMemorySyncCache } from './in-memory-sync';
cacheRepositoryContract(() => new InMemorySyncCache<string>());
