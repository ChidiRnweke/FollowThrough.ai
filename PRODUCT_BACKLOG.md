# Product Backlog

This backlog captures product capabilities that are not yet complete. Items are intentionally
high-level and unscoped; each should be explored and turned into its own feature blueprint before
implementation.

## Retrieval

- [ ] **Hybrid retrieval (BM25 + RRF)** — Fuse lexical BM25 ranking with the existing semantic
      search. Requires a Postgres BM25 extension (e.g. ParadeDB pg_search or VectorChord-bm25),
      which the current pgvector image does not ship; deferred when project memory shipped on
      semantic-only retrieval.

## Content transformations

- [ ] **General selection transformations** — Rewrite, expand, summarize, or restructure selected
      note content in place through the suggestion flow.
- [ ] **Action-oriented drafting** — Turn project context or selected material into follow-ups,
      briefs, emails, reports, and other working drafts.
- [ ] **Reusable output workflows** — Allow skills to define repeatable transformations from notes,
      todos, project context, and artifacts into useful outputs.

## Images and visual assets

- [ ] **Image search and insertion** — Find relevant external images from selected content and
      insert an approved result into a note.
- [ ] **AI image generation** — Generate images from note content or instructions, review them, and
      save approved images to the project.
- [ ] **Image asset management** — Keep image files, metadata, attribution, provenance, and source
      relationships available within the project.

## Diagrams

- [ ] **Embedded draw.io editor** — Open and manually edit promoted draw.io diagrams without leaving
      the workbench.
- [ ] **Production Mermaid-to-draw.io conversion** — Convert Mermaid structure into useful editable
      draw.io shapes, connectors, and layout.
- [ ] **Draw.io rendering and versioning** — Produce reliable previews and retain revisions as a
      diagram is polished.

## Deliverables and artifacts

- [ ] **Document generation and export** — Turn project material into finished documents that can leave the app.
- [ ] **Presentation generation and export** — Build editable presentation drafts from project notes,
      context, diagrams, and images.
- [ ] **Artifact workspace** — Provide a project-level place to find, inspect, organize, and reopen
      generated diagrams, images, documents, presentations, and other outputs.
- [ ] **Artifact source tracking** — Preserve the notes, selections, context, skills, and agent runs
      used to create or revise each artifact.
- [ ] **Deliverable refinement workflow** — Support reviewing, revising, and polishing generated work until it is ready to share.

## Backlog conventions

- An item being listed here does not imply a chosen scope, design, priority, or implementation order.
- Scope one item at a time against the current repository before implementation.
- Remove an item from this file once its agreed acceptance criteria are implemented and verified.
