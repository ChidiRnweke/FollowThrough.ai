# Project Brief — Architect's Workbench

_Working document. Last updated: 2026-07-11._

## What this is

A personal workbench for solution architecture work: a note-taking app with a WYSIWYG rendered-markdown editor, a first-class task tracker, diagramming, and AI productivity built in. The note is the workspace; everything else — todos, backlinks, references, diagrams, chat — enriches it or derives from it.

Each account is private and user-owned. There are no workspaces, organisations, members, collaboration, or sharing. The product is shaped around how I work as a solution architect: project filesystems containing meeting notes, commitments, decisions, references, skills, and diagrams that go from rough sketch to polished deliverable.

## Core concepts

**Notes** are the primary object, edited in a WYSIWYG markdown editor. Canonical storage is the editor's document format (ProseMirror JSON); markdown is the import/export format.

**Todos are first-class objects**, not checkbox lines. A todo has its own identity, status, owner, and due date, lives in the database, and appears both in a dedicated todo view and embedded inside notes as a live node — checking it off in one place updates it everywhere. Every AI-created todo links back to the note and text span it came from.

**Skills** are documents that encode my methodology — templates, conventions, ways of working (e.g., how I write ADRs, how I run client discovery, my C4 notation preferences). A skill is markdown with a name and description; the agent sees only the index of names/descriptions and loads the full skill on demand. Skills are edited in the app itself, since they're just notes.

## AI features

There are two kinds of AI capability, deliberately kept separate.

### Point solutions

Fast, single-purpose pipelines invoked from the editor on a selection. They use structured output against a fixed schema, are individually testable, and return results in seconds. Three exist in v1:

**Extract Promises.** Finds commitments in selected text and turns them into todos. It separates the action, the owner, and the due date; it distinguishes my commitments from things I'm waiting on from others; it keeps both the verbatim due-date phrasing and a resolved date; and it classifies each promise as explicit, implied, or tentative — explicit ones can auto-create todos, the rest go to review. Questions and floated options are not promises.

**Relate.** Finds notes related to the selection and proposes backlinks. Retrieval-driven (the project note index does the heavy lifting), with the model reranking and labeling each relationship from a closed set (prior-decision, contradicts, elaborates, mentions) plus a justification snippet. Surfacing _contradicts_ and _prior-decision_ links is a headline goal — "you decided the opposite in March" is the most valuable link the system can make.

**Reference.** Finds external, web-sourced links relevant to the selection. A fixed two-step pipeline (search, then synthesize/rank) returning tiered sources — official docs, standards, and vendor references above blog posts — each with a one-line relevance note written against my selection. It is explicitly allowed to return "nothing relevant found" rather than pad with mediocre links. Results always go to review; Reference never auto-inserts.

### Agent runtime

An off-the-shelf agent runtime (e.g., OpenAI Agents SDK, TypeScript) powers open-ended work: the in-app chat and diagram generation. The agent has tools mapping to app operations (search and read notes, create notes and todos, insert content, generate diagrams, web search) and uses skills for methodology. The current note and selection are injected as context, so "turn this into a sequence diagram" or "what did I promise the client this week" work without setup.

The point solutions are registered as tools in the runtime, so the agent calls the same tested pipelines rather than improvising its own extraction — but they remain directly invokable from the editor without going through the agent.

Both front doors — point solutions and agent — go through one shared services layer (project tree, notes, todos, retrieval index, web search, provenance), so a todo created from the bubble menu and one created via chat behave identically.

## Diagrams

Two formats, two jobs, one bridge.

**Mermaid** is the AI-native drafting medium: thinking diagrams, generated and refined conversationally, rendered inline in the note. Layout is automatic and imperfect, which is acceptable because these diagrams externalize thought.

**Draw.io** is the finishing medium: deliverable diagrams with manual layout control and the stencils client work expects. Embedded via the draw.io editor, stored as its XML, displayed inline via a cached SVG export.

**Promotion path:** a Mermaid diagram can be promoted into an editable draw.io diagram once its structure settles. AI drafts and iterates in Mermaid; I take over layout and polish in draw.io. After promotion, the diagram is mine — AI editing of polished draw.io diagrams is out of scope for now.

Diagram text content (node and edge labels) is indexed so diagrams are searchable and Relate can find them.

## The approval flow

Every AI output is a **suggestion in a standard envelope**, regardless of which pipeline or the agent produced it. The envelope carries what is proposed (todo, backlink, reference, content insertion), the provenance (which pipeline or agent, when), and the source anchor (which note, which text).

Suggestions move through a lifecycle: **proposed → accepted / rejected** (with expiry for stale ones). Accepting applies the change through the services layer; rejecting discards it. Auto-accept is a per-pipeline policy, not an architectural fork: explicit promises may auto-create todos, references never auto-insert, and everything auto-accepted remains visibly AI-originated and one-click reversible.

UX principles that follow: AI insertions are visually distinct from my own writing; every AI artifact links back to its source text; nothing the AI does silently mutates a note; trust is earned per pipeline, and auto-accept thresholds can tighten or loosen per pipeline as that trust develops.

## Stack decisions made so far

Web-based first. Svelte/SvelteKit. Editor: **Edra** (Tiptap-based, shadcn flavor, source copied into the project) with custom node views for todos, backlinks, references, and diagrams. Agent runtime: off-the-shelf (OpenAI Agents SDK for TypeScript is the current candidate). Mermaid rendered client-side; draw.io via its embed protocol. Multiple private accounts are supported from the start with strict per-user data isolation.

Data and infrastructure: **Postgres with pgvector** (project-scoped note and diagram embeddings for Relate and retrieval live beside the domain data), **Drizzle** as the ORM, and **Docker** for local infrastructure. Authentication via **OAuth2** remains deliberately separate. UI is built on **shadcn-svelte** with the custom workbench design system.

## V1 scope

Everything above is in scope for v1: the editor, the three point solutions, todos as a first-class view, Mermaid and draw.io diagrams with the promotion path, agent chat, and skills. Implementation will be largely agent-driven, so the scope is set by design coherence rather than build effort.

## Open questions

- Whether the agent proposes all note edits through the envelope only, or gains a scoped direct-write ability for low-risk operations.
- Hosting target for the Docker deployment — not yet discussed.
