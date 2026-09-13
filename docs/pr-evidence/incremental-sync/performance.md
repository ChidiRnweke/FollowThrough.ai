# Client synchronization benchmark

Measured on 2026-09-13 with headless Chromium and the real IndexedDB repository, in the
Svelte component preview. The fixture contains 7,000 serialized synthetic records: 5,000
message-shaped strings and 2,000 provenance-shaped strings. Each has eight repetitions of
`Representative saved workspace content.`. A subscriber rebuilds the visible projection on
cache notifications. The transport is an in-memory connection, with no artificial latency.
These are client storage measurements, not production network or PostgreSQL measurements.

| Implementation                                     | Warm time | Bodies retained |          Body requests |        Long tasks |
| -------------------------------------------------- | --------: | --------------: | ---------------------: | ----------------: |
| PR head `8dd1697936906c1cd295a3057008b0b6704d6021` | 27,744 ms |           7,000 | 7,000 individual reads | 2; maximum 198 ms |
| Paged inventory and batched bodies                 |  9,603 ms |           7,000 |            219 batches |                 0 |

The measured configuration uses 256 identities per journal page and 32 bodies per batch.
It reduces notification and transaction overhead while retaining every item. Those sizes
bound one response, not the total inventory. Pagination continues until `hasMore` is false.
Foreground reads share an existing batch or start independently of queued background work.
One malformed body produces a per-item failure and does not reject other valid bodies.

This is one run per implementation, without CPU throttling. It is directional evidence,
not a latency guarantee or a statistical comparison. Browser startup and module loading are
excluded from the warm timer. The PerformanceObserver records long tasks from page startup.
The intended full 5,000-message/2,000-provenance PostgreSQL/PWA benchmark could not run locally:
Docker is unavailable in this WSL environment. SQL contract and PWA results must be reported
separately. No resource types were removed to obtain these results.
