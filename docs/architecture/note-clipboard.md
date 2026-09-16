# Copying note images and Mermaid diagrams

The editor serializes its captured selection before asynchronous work begins. Its host
passes that value to `ClipboardTransfer`, which coordinates image reads, diagram rendering,
HTML embedding, and the native clipboard write. Models contain transfer values and reports.
Browser adapters handle DOM serialization, image decoding, and the clipboard API.

The native write starts synchronously with pending blob promises. Waiting for media before
starting that write can lose the browser's user activation.

Every selected image and Mermaid diagram is processed. The previous 24-diagram and 12 MiB
ceilings had no recorded measurement and could leave nonportable media behind. They are
removed. Native resource or permission failures remain possible and produce explicit reports.

Images use same-origin credentials only for same-origin requests. External images require
normal CORS access. Image bytes are decoded before embedding; non-PNG images become PNGs.
Missing media becomes a visible placeholder in copied HTML and text. A failed rich write can
produce text only, with a warning. Failure of both writes returns a failure report.

Cut deletes the captured selection only after a complete write. An incomplete write keeps
the note content. If the document changed while copying, the source is also retained and the
user is told why. Moving the selection without editing the document does not change which
range is removed.

## Evidence

- Browser adapter tests cover an unavailable attachment, 25 diagrams, a valid PNG larger
  than 12 MiB, temporary image URLs, lone images, text-only fallback, and denied writes.
- Mounted-editor tests cover incomplete cuts, complete cuts, intervening edits, and selection
  movement during copying.
- Chromium copied mixed prose, an image, a Mermaid diagram, and an unavailable attachment
  through the native clipboard into a separate-origin editable document. The old helper
  produced a broken image; the new controller produced a visible missing-image placeholder.
  The working image and diagram decoded in both cases. Matching captures are in
  `docs/pr-evidence/portable-note-clipboard/`.

The browser capture uses a minimal editor schema and the production clipboard code. It is
not an authenticated full-note-editor test or a desktop office application test. Native paste
was checked in Chromium; other browser engines remain unverified. Saved draw.io references
need separate portability handling as part of the remaining diagram-reference work.
