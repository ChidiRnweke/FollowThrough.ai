# Editor content recovery

The shared notes editor-content service owns conversion of unreadable stored blocks into visible
JSON code blocks. The actual editor entry, toEditorContent, applies this rule before making its
detached JSON copy for Tiptap. The copy still supports Svelte state proxies. Opening and saving a
note keep the same behavior; no public request or storage schema changes.

The model retains strict write parsing and resilient storage reading under ADRs 0015 and 0037.
It also retains unknownProseMirrorNodes: corpus and editor-schema conformance tests use that value
query to report unsupported stored blocks. Nested invalid content degrades its whole top-level
container, so the top-level diagnostic query matches the reader's representation. These are live
boundary and diagnostic functions, not unused workflow helpers.

documentNodeContent, documentInlineText and documentTextMarks remain model value queries. PDF and
DOCX use them to read the canonical node representation; renderers still decide layout and styles.
This disposition covers these declarations, not every declaration in the notes namespace.

## Guarantees and test dispositions

Keep strict parser, resilient reader, corpus and editor-schema conformance tests. Add recovery tests
through the real storage reader: unsupported content remains copyable JSON beside unchanged known
blocks, and a malformed whole document remains visible. Keep browser opening tests for detached
editor content and Svelte proxies. The new tests use states the storage reader actually produces.

Other note workflows and the remaining assessment inventory still need their own dispositions.
