# Archive import identities and partial outcomes

The upload boundary reads ZIP entries and YAML frontmatter before invoking the notes controller.
Its server-only reader lives in `remote/notes/archive-reader.server.ts`. Models carry parsed entries,
reference identities, and report schemas. The Chisel patch classifies `remote/**/*.server.ts` as
transport boundary helpers; regression tests retain the ban on services importing these readers.

`Notes.importMarkdownArchive` owns folder creation, note identities, and body saves. It calls the
folder service directly and reuses its own ordinary note writes, including anchor repair, backlinks,
and indexing. The former imports controller and its factory-injected controller dependencies are gone.

## Link identity

- A qualified wiki link such as `[[reviews/Decision]]` names a normalized archive path. A Markdown
  extension is optional. Leading `/` names the archive root; explicit `./` and `../` resolve from the
  source folder. A path cannot escape the archive root.
- A bare link such as `[[Decision]]` resolves only when its title identifies one archive entry.
  Matching ignores case and normalizes Unicode. Two same-named notes remain ambiguous even when
  creation of one fails.
- A piped link retains its display label. All identities are established before bodies are saved,
  so forward links work.
- Missing, ambiguous, and failed targets remain as written and appear in `unresolvedLinks`.
  Heading references also remain as written because this importer does not implement heading links.
  It does not silently replace a heading link with a link to the whole note.

The reference index is built once per archive. Neither import order nor the last matching title
chooses a link target.

## Partial imports

ADR 0014 still applies. A failed folder blocks its descendants; the result names the failed folder
and blocked paths. Independent folders and notes continue. No child falls back to the project root.
A failed body save can leave its already-created blank note, and the result names that failure.
The report lists unresolved links separately from files that could not be imported.

## Evidence

The before/after scenario contains `a/report.md`, `b/report.md`, and `index.md` with `[[report]]`.
The original controller from the base revision attached one of the two IDs without reporting a
problem. The revised controller retains the literal link and reports ambiguity. Both report captures
use the actual import dialog at 900 × 650 in light mode, with those observed controller reports
returned to a synthetic upload. This is component evidence, without an authenticated server upload.

Controller tests use real note and project services with shared in-memory repositories. They check
stored documents, parent IDs, backlinks, indexing, failed branches, and retained blank notes.
The archive reader retains its ZIP-limit, path, extension, and frontmatter regressions. Existing
wiki-link behavior tests moved out of models and now exercise the import service.
