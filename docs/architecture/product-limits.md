# Product limits and complete results

Valid note and skill patches have no replacement-count ceiling. Task batches, bulk note reads,
and exports contain every requested item. Atomicity, ownership, required fields, exact anchors,
and request identity still apply. A failed batch must not report a partial success.

Submitted selections, images, open tabs, and unsaved text retain their complete content.
OCR keeps every returned page in order; text parsing does not slice decoded content. Revision
diffs, eligible skill summaries, and ranked relationship candidates are not cut after an arbitrary
count. Large saved content can still use the complete virtual-file namespace (ADR 0035).

Tool discovery remains capped at **15** in agent and MCP interfaces. Maximum turns is unchanged.
Requested result counts, paging, numeric domain ranges, portable skill-format requirements,
concurrency, timeouts, and presentation previews retain their existing contracts.

Icon search honors its requested count, using the provider's documented 32–999 request range and
`start` pagination. A provider or pagination failure is reported, not returned as a shorter success.
See [Iconify's search contract](https://iconify.design/docs/api/search.html).

The deployed HTTP body limit remains operator-controlled. Archive expanded-byte and entry-count
admission remain configurable decompression safeguards. Their defaults are 25 MiB and 2,000 entries;
rejections name the relevant setting. These are operational admission controls, not note-size or
folder-depth restrictions. Upload/storage/provider failures remain explicit.

No database migration is needed. Old saved run snapshots can retain their partial skill-catalogue
flag and discovery guidance; newly assembled catalogues contain every eligible summary. Previously
processed attachment content is not rewritten automatically.
