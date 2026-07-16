## Executor Instructions

You are executing this blueprint. Follow these rules:

1. **Read this file first.** Every loop, re-read this file before doing anything.
   After context compaction, this file is your ground truth.
2. **Copy the Checklist.** At the start of your execution, copy the remaining unchecked steps into your response scratchpad to track your own progress.
3. **Validate the Plan.** Before executing the first step, quickly validate that the plan's assumptions align with the current codebase constraints.
4. **Do the next unchecked step.** Find the first `- [ ]` item. Do that. Only that.
5. **Verify before checking off.** Run the verification described in the step.
   If it passes, change `- [ ]` to `- [x]` and commit.
6. **Commit after each step.** `git add -A && git commit -m "deliverables: [step title]"`
7. **Don't skip ahead.** Steps are ordered by dependency.
8. **Follow existing patterns.** When the step references an existing file as an example,
   match its structure. Don't invent new patterns.
9. **If stuck, document and move on.** If a step is blocked, add a note under it explaining
   why, check it off as blocked, and move to the next step. Don't spiral.
10. **Update this file.** If you discover something during execution that future steps need
    to know, add a note in the relevant step. Keep the blueprint as the single source of truth.

---

# Blueprint: Deliverables and Artifacts

## Context

FollowThrough.ai is a SvelteKit full-stack application where users capture notes, manage todos, run AI agents, and build project context. Currently, there is no way to turn project material into portable deliverables (DOCX, PDF) that leave the app. The export system is limited to client-side Markdown/HTML/JSON downloads of individual editor content.

This feature adds a complete deliverable generation pipeline: users upload branded DOCX templates to a project, then export note content as styled DOCX or direct PDF. Every exported artifact is tracked with provenance (which notes produced it, which agent run), and all artifacts are browsable in a new top-level workspace.

The codebase follows a strict layered architecture: Routes → Controllers → Services → Repositories. All dependencies are wired through `ProductionControllerFactory` in `src/lib/server/production-factory.ts`. Client-server communication uses SvelteKit `command`/`query` remote functions. Agents access all capabilities through a tool registry. Uploads use a two-phase S3 pre-signed URL pattern (initiate → client uploads to S3 → complete).

**Key files to follow as patterns:**
- Controller: `src/lib/controllers/projects/controller.ts`
- Service contracts: `src/lib/services/projects/contracts.ts`
- Service implementation: `src/lib/services/projects/management.ts`
- Repository interface: `src/lib/repositories/projects.ts`
- Postgres repository: `src/lib/server/repositories/postgres-projects.ts`
- Remote functions: `src/lib/remote/projects.remote.ts`
- API route: `src/routes/api/attachments/+server.ts` (multi-op POST pattern)
- DI wiring: `src/lib/server/production-factory.ts`
- Sidebar nav: `src/lib/components/app/app-sidebar.svelte`

## Scope

**In scope:**

- Upload, store, list, and delete branded DOCX templates scoped to a project
- Extract styling from a reference DOCX: fonts, heading styles (H1-H6), logo images, page margins, headers/footers, color theme
- Generate a styled DOCX from one or more notes using an extracted template style definition
- Generate a direct PDF from one or more notes (no template needed)
- Store generated artifacts in S3 with database records tracking their metadata
- Track artifact provenance: which notes, template, and agent run produced each artifact
- Top-level `/artifacts` page to browse all generated artifacts per project
- Export UI entry points: note editor, project overview, note workspace (multiple notes), agent chat
- Export capabilities exposed as agent tools so agents can generate deliverables autonomously
- Ability to re-generate an artifact when its source notes change

**Out of scope:**

- Presentation generation (.pptx)
- In-app deliverable editing/refinement workflow — users edit DOCX/PDF externally
- Artifact version history beyond a single generation record
- Template placeholder/content injection (templates are for styling/branding only)
- Image search, AI image generation (separate backlog items)

## Architecture Decisions

### Libraries

- **DOCX generation**: [`docx`](https://www.npmjs.com/package/docx) (v9+) — industry-standard programmatic DOCX creation with comprehensive styling, headers/footers, and image support.
- **DOCX template reading**: `adm-zip` for extracting internal XML from .docx (a ZIP file), then parse `word/styles.xml`, `word/document.xml`, and `word/media/` to extract style definitions and embedded images.
- **PDF generation**: `pdfmake` (v0.3+) — declarative document definition, good text flow/layout, built-in table support, server-side friendly. Converts Tiptap/ProseMirror JSON to pdfmake document definition.
- **No new S3/storage dependencies**: reuse existing `@aws-sdk/client-s3` patterns from the attachment system.

### Template storage

Templates are project-scoped files. They use the same S3 storage as attachments but with their own DB table (`project_templates`) rather than being attached to notes. The two-phase upload pattern (initiate → pre-signed URL → complete) is reused. Templates are stored under S3 prefix `projects/${projectId}/templates/`.

### Artifact storage

Generated artifacts (DOCX, PDF) are stored in S3 under `artifacts/${userId}/${artifactId}`. Metadata is stored in a new `artifacts` DB table.

### Route

Artifact workspace at `/artifacts` (top-level route group, like `/todos` and `/suggestions`).

### Tiptap → DOCX/PDF conversion

The note content is stored as ProseMirror JSON in `notes.document`. The conversion walks the ProseMirror document tree and maps nodes to `docx` elements (Paragraph, HeadingLevel, etc.) or `pdfmake` content objects. A shared converter module handles the common parsing logic.

---

## Plan

- [ ] **Step 1: Add domain types for artifacts and templates**
      **Files:** `src/lib/models/domain.ts` (modify), `src/lib/models/shared.ts` (modify), `src/lib/models/views.ts` (modify)
      **What:** Add the following types:
      - In `shared.ts`: `ArtifactId` (branded `Branded<string, 'ArtifactId'>`), `TemplateId` (branded `Branded<string, 'TemplateId'>`)
      - In `domain.ts`: `Artifact` interface: `{ id: ArtifactId; userId: UserId; projectId: ProjectId; title: string; format: 'docx' | 'pdf'; objectKey: string; byteSize: number; sourceNoteIds: NoteId[]; templateId?: TemplateId; provenanceId?: ProvenanceId; runId?: AgentRunId; createdAt: DateTime }`
      - In `domain.ts`: `ProjectTemplate` interface: `{ id: TemplateId; userId: UserId; projectId: ProjectId; name: string; objectKey: string; mediaType: string; byteSize: number; extractedStyles?: Record<string, unknown>; isDefault: boolean; createdAt: DateTime; updatedAt: DateTime }`
      - In `domain.ts`: `ExtractedTemplateStyles` type: `{ fonts: { heading: Record<string, { name: string; size: number; bold: boolean; italic: boolean; color?: string }>; body: { name: string; size: number; color?: string } }; pageMargins: { top: number; bottom: number; left: number; right: number }; headerImages?: string[]; footerContent?: string; themeColors: Record<string, string> }`
      - In `domain.ts`: `ArtifactView` interface combining `Artifact` + `projectName: string` + `templateName?: string` for list displays.
      - In `views.ts`: Export IO types: `ListArtifactsOutput extends ListOutput<ArtifactView>`, `GenerateDocumentInput { projectId: ProjectId; noteIds: NoteId[]; title: string; format: 'docx' | 'pdf'; templateId?: TemplateId }`, `GenerateDocumentOutput { artifact: Artifact; downloadUrl: string }`.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 2: Add database tables for templates and artifacts**
      **Files:** `src/lib/server/db/schema.ts` (modify)
      **What:** Add two new pgTable definitions following the existing pattern:
      - `projectTemplates` table: columns `id` (uuid PK defaultRandom), `userId` (uuid FK → users), `projectId` (uuid FK → projects), `name` (text not null), `objectKey` (text not null), `mediaType` (text not null), `byteSize` (bigint not null), `extractedStyles` (jsonb, default `{}`), `isDefault` (boolean, default false), `createdAt`, `updatedAt`. Add a unique index on `(projectId, name)`.
      - `artifacts` table: columns `id` (uuid PK defaultRandom), `userId` (uuid FK → users), `projectId` (uuid FK → projects), `title` (text not null), `format` (text not null, either `'docx'` or `'pdf'`), `objectKey` (text not null), `byteSize` (bigint not null), `sourceNoteIds` (jsonb not null, array of note UUIDs), `templateId` (uuid FK → projectTemplates, nullable), `provenanceId` (uuid FK → provenance, nullable), `runId` (text, nullable), `createdAt` (timestamp defaultNow).
      - Export both tables from the schema barrel.
      **Verify:** `pnpm typecheck` passes. No schema conflicts.

- [ ] **Step 3: Generate Drizzle migration for new tables**
      **Files:** `drizzle/` (new migration file auto-generated)
      **What:** Run `pnpm exec drizzle-kit generate` to produce a migration. Verify the generated SQL creates `project_templates` and `artifacts` tables with correct columns and constraints.
      **Verify:** `pnpm exec drizzle-kit generate` succeeds. Inspect the generated SQL file to confirm correct table definitions.

- [ ] **Step 4: Create repository interfaces for templates and artifacts**
      **Files:** `src/lib/repositories/templates.ts` (create), `src/lib/repositories/artifacts.ts` (create)
      **What:**
      - `templates.ts`: Export `TemplateRepository` interface with methods: `insert(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate>`, `findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined>`, `listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>`, `update(actor: ActorContext, input: Partial<ProjectTemplate> & { id: TemplateId }): Promise<ProjectTemplate>`, `delete(actor: ActorContext, id: TemplateId): Promise<void>`.
      - `artifacts.ts`: Export `ArtifactRepository` interface with methods: `insert(actor: ActorContext, artifact: Artifact): Promise<Artifact>`, `listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ArtifactView[]>`, `findById(actor: ActorContext, id: ArtifactId): Promise<Artifact | undefined>`, `delete(actor: ActorContext, id: ArtifactId): Promise<void>`.
      - Follow the same pattern as `src/lib/repositories/projects.ts` — export interface, use `ActorContext`, branded IDs.
      - Update `src/lib/repositories/index.ts` barrel to export both.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 5: Create Postgres repository implementations for templates and artifacts**
      **Files:** `src/lib/server/repositories/postgres-templates.ts` (create), `src/lib/server/repositories/postgres-artifacts.ts` (create)
      **What:**
      - `postgres-templates.ts`: Implement `TemplateRepository` using Drizzle. Follow the exact structure of `src/lib/server/repositories/postgres-projects.ts` (class with `db` constructor param, `insert` using `db.insert().values().returning()`, `findById` using `eq()`, list with `and(eq(...))`, update with `eq()` + `returning()`, delete with `eq()`).
      - `postgres-artifacts.ts`: Implement `ArtifactRepository`. The `listByProject` method must LEFT JOIN with `projects` and `projectTemplates` to produce `ArtifactView` (with `projectName` and `templateName`). Use Drizzle's `.leftJoin()` and `.select()` with aliases.
      - Use the existing `db` import from `src/lib/server/db/index.ts`. Import schema tables from `src/lib/server/db/schema.ts`.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 6: Create the DOCX template style extractor utility**
      **Files:** `src/lib/server/domain/template-style-extractor.ts` (create)
      **What:** Create a module that reads a DOCX file (ZIP) and extracts styling information:
      - Accept a `Buffer` of the .docx file
      - Use `adm-zip` to open the ZIP and read `word/styles.xml`
      - Parse `w:style` elements for heading styles (`Heading1` through `Heading6`) extracting font name (`w:rFonts`), size (`w:sz`), bold (`w:b`), italic (`w:i`), color (`w:color`)
      - Parse the `Normal` paragraph style for body font defaults
      - Read `word/document.xml` for default paragraph properties (page margins)
      - Extract images from `word/media/` — store as base64 buffers with content type
      - Extract header/footer text from `word/header*.xml` and `word/footer*.xml` if present
      - Return an `ExtractedTemplateStyles` object
      - Handle missing styles gracefully — return partial results with sensible defaults
      - Add `adm-zip` to `package.json`: `pnpm add adm-zip`
      - Export a single function: `extractTemplateStyles(docxBuffer: Buffer): Promise<ExtractedTemplateStyles>`
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 7: Create the DOCX generator**
      **Files:** `src/lib/server/domain/docx-generator.ts` (create)
      **What:** Create a module that generates a .docx file from note content and extracted template styles:
      - Accept: `{ notes: Array<{ title: string; document: ProseMirrorDocument }>; styles: ExtractedTemplateStyles; title: string }`
      - Install `docx`: `pnpm add docx`
      - Walk each note's ProseMirror JSON document, mapping nodes:
        - `doc` → `Document` with page margins from styles
        - `heading` (level 1-6) → `HeadingLevel.HEADING_1` through `HEADING_6` with heading fonts/sizes from styles
        - `paragraph` → `Paragraph` with body font from styles
        - `bulletList` / `orderedList` → `TextRun` with bullet/numbering
        - `blockquote` → paragraph with indent
        - `horizontalRule` → `HorizontalRule`
        - `codeBlock` → paragraph with monospace font
        - `image` → `ImageRun` if the image is referenced as a base64/URL attachment
      - Apply header/footer to document sections if styles define them
      - If `styles.headerImages` has images, embed them in the header
      - Use `Packer.toBuffer(doc)` to produce the final Buffer
      - Export a single function: `generateDocx(input: GenerateDocxInput): Promise<Buffer>`
      - Add type `GenerateDocxInput` with the accepted shape
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 8: Create the PDF generator**
      **Files:** `src/lib/server/domain/pdf-generator.ts` (create)
      **What:** Create a module that generates a PDF from note content:
      - Accept: `{ notes: Array<{ title: string; document: ProseMirrorDocument }>; title: string; styles?: ExtractedTemplateStyles }`
      - Install `pdfmake`: `pnpm add pdfmake` and `pnpm add -D @types/pdfmake`
      - Walk each note's ProseMirror JSON to build a pdfmake `TDocumentDefinitions`:
        - `doc` → document-level defaults (margins, fonts from styles if available)
        - `heading` → `{ text, style: 'header' }` with level-based fontSize/bold
        - `paragraph` → `{ text, style: 'paragraph' }`
        - `bulletList` → pdfmake `ul` array
        - `orderedList` → pdfmake `ol` array
        - `blockquote` → paragraph with `italics: true`, `margin: [20, 0, 20, 0]`
        - `codeBlock` → `{ text, font: 'Courier', fontSize: 9, background: '#f5f5f5' }`
        - `horizontalRule` → `{ canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] }`
      - Register custom fonts in pdfmake if template styles specify specific fonts (use built-in defaults otherwise)
      - Use pdfmake's `createPdf(documentDefinition).getBuffer()` returning a Buffer
      - Export a single function: `generatePdf(input: GeneratePdfInput): Promise<Buffer>`
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 9: Create the shared ProseMirror-to-content converter**
      **Files:** `src/lib/server/domain/prosemirror-converter.ts` (create)
      **What:** Extract the shared ProseMirror document walking logic into a single module used by both the DOCX and PDF generators. The converter should:
      - Accept a `ProseMirrorDocument` (the `document` JSON from a note)
      - Walk the node tree depth-first
      - Call a visitor pattern: for each node type (`heading`, `paragraph`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `image`, `text`, `hardBreak`, `mention`, `mathInline`, `mermaid`, `embed`), invoke a callback
      - Export `walkProseMirrorDoc(doc: ProseMirrorDocument, visitors: ProseMirrorVisitors): void` where `ProseMirrorVisitors` is a map of node type to handler function
      - Support `marks` (bold, italic, strikethrough, code, link) — expose mark data in text node callbacks
      - Use this converter in both `docx-generator.ts` and `pdf-generator.ts` (refactor those steps to use it)
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 10: Create service contracts for template and artifact management**
      **Files:** `src/lib/services/templates/contracts.ts` (create), `src/lib/services/artifacts/contracts.ts` (create)
      **What:**
      - `templates/contracts.ts`: Export fine-grained role interfaces:
        - `TemplateUploader`: `initiateUpload(actor, input: { projectId: ProjectId; name: string; mediaType: string; byteSize: number; checksumSha256: string }): Promise<{ template: ProjectTemplate; uploadUrl: string; requiredHeaders: Record<string, string> }>` and `completeUpload(actor, templateId: TemplateId): Promise<ProjectTemplate>`
        - `TemplateLister`: `list(actor, projectId: ProjectId): Promise<readonly ProjectTemplate[]>`
        - `TemplateDeleter`: `delete(actor, templateId: TemplateId): Promise<void>`
        - `TemplateStyleExtractor`: `extractStyles(actor, templateId: TemplateId): Promise<ExtractedTemplateStyles>`
      - `artifacts/contracts.ts`: Export role interfaces:
        - `DocumentGenerator`: `generate(actor, input: GenerateDocumentInput): Promise<{ artifact: Artifact; downloadUrl: string }>`
        - `ArtifactLister`: `list(actor, projectId: ProjectId): Promise<readonly ArtifactView[]>`
        - `ArtifactReader`: `get(actor, artifactId: ArtifactId): Promise<Artifact | undefined>`, `download(actor, artifactId: ArtifactId): Promise<{ url: string }>`
        - `ArtifactDeleter`: `delete(actor, artifactId: ArtifactId): Promise<void>`
        - `ArtifactRegenerator`: `regenerate(actor, artifactId: ArtifactId): Promise<{ artifact: Artifact; downloadUrl: string }>`
      - Follow the same pattern as `src/lib/services/projects/contracts.ts` — one interface per concern.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 11: Create template management service implementation**
      **Files:** `src/lib/services/templates/management.ts` (create)
      **What:** Implement a `TemplateManagementService` class that implements all template role interfaces. Follow the same structure as `src/lib/services/attachments/management.ts`:
      - Constructor takes: `storage: StorageService`, `templateRepo: TemplateRepository`, `styleExtractor` (function), `transactionRunner: TransactionRunner`
      - `initiateUpload`: generates a staging object key `projects/${projectId}/templates/${templateId}`, creates a `ProjectTemplate` record via repo, gets pre-signed upload URL from storage.
      - `completeUpload`: stats the S3 object to verify byte size, promotes from staging to `projects/${projectId}/templates/${templateId}`, calls style extractor on the buffer, updates the template record with extracted styles.
      - `list`: delegates to `templateRepo.listByProject()`
      - `delete`: deletes S3 object, removes DB record
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 12: Create artifact management service implementation**
      **Files:** `src/lib/services/artifacts/management.ts` (create)
      **What:** Implement an `ArtifactManagementService` class implementing all artifact role interfaces. Follow the same service pattern:
      - Constructor takes: `artifactRepo: ArtifactRepository`, `storage: StorageService`, `docxGenerator: (input: GenerateDocxInput) => Promise<Buffer>`, `pdfGenerator: (input: GeneratePdfInput) => Promise<Buffer>`, `provenanceRecorder: ProvenanceRecorder`, `noteReader: NoteReader`, `templateRepo: TemplateRepository`, `transactionRunner: TransactionRunner`
      - `generate`: loads source notes via `noteReader.get()`, loads template styles if templateId provided, calls the appropriate generator (DOCX or PDF), stores result in S3 at `artifacts/${userId}/${artifactId}`, records provenance (producerKind: 'user' or 'agent'), creates artifact DB record, generates a pre-signed download URL.
      - `list`: delegates to `artifactRepo.listByProject()`
      - `get`, `download`, `delete`: straightforward delegation
      - `regenerate`: loads the existing artifact, re-runs `generate` with the same sourceNoteIds and templateId but fresh note content, creates a new artifact record (does not overwrite old).
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 13: Create controller for deliverables**
      **Files:** `src/lib/controllers/deliverables/controller.ts` (create)
      **What:** Create controller following the exact pattern in `src/lib/controllers/projects/controller.ts`:
      - `DeliverablesController` interface with methods: `initiateTemplateUpload(actor, input)`, `completeTemplateUpload(actor, input)`, `listTemplates(actor, projectId)`, `deleteTemplate(actor, templateId)`, `generateDocument(actor, input: GenerateDocumentInput)`, `listArtifacts(actor, projectId)`, `getArtifact(actor, artifactId)`, `downloadArtifact(actor, artifactId)`, `deleteArtifact(actor, artifactId)`, `regenerateArtifact(actor, artifactId)`
      - `DeliverablesDependencies` interface aggregating all the role interfaces: `TemplateUploader`, `TemplateLister`, `TemplateDeleter`, `DocumentGenerator`, `ArtifactLister`, `ArtifactReader`, `ArtifactDeleter`, `ArtifactRegenerator`, `TransactionRunner`
      - `DefaultDeliverablesController` class with constructor taking `DeliverablesDependencies`. Each method delegates to the appropriate dependency. Mutating operations wrap in `transactionRunner.run()`.
      - Create barrel at `src/lib/controllers/deliverables/index.ts`.
      - Update `src/lib/controllers/index.ts` to export the deliverables controller and types.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 14: Wire deliverables into the DI system**
      **Files:** `src/lib/factories/controller-factory.ts` (modify), `src/lib/factories/production-controller-factory.ts` (modify), `src/lib/server/production-factory.ts` (modify), `src/lib/factories/index.ts` (modify)
      **What:**
      - Add `deliverables(): DeliverablesController` to `ControllerFactory` interface
      - Add `deliverables: DeliverablesDependencies` to `ProductionControllerDependencies`
      - In `ProductionControllerFactory.deliverables()`, return `new DefaultDeliverablesController(this.dependencies.deliverables)`
      - In `src/lib/server/production-factory.ts`: instantiate `PostgresTemplateRepository`, `PostgresArtifactRepository`, `TemplateManagementService`, `ArtifactManagementService`. Wire them into `dependencies.deliverables`. Use the existing `s3Storage` from the attachment wiring. Use the existing `provenanceRecorder` and a note reader. Import the template style extractor and DOCX/PDF generators.
      - Follow the exact wiring pattern already used for `attachments` in `production-factory.ts`.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 15: Create API routes for deliverables**
      **Files:** `src/routes/api/deliverables/+server.ts` (create)
      **What:** Create API route following the multi-op POST pattern from `src/routes/api/attachments/+server.ts`:
      - `POST` with no `op` → generate document (`controller.generateDocument`)
      - `POST` with `op: 'initiate-template-upload'` → initiate template upload
      - `POST` with `op: 'complete-template-upload'` → complete template upload
      - `POST` with `op: 'download-artifact'` → get download URL
      - `POST` with `op: 'regenerate-artifact'` → regenerate
      - `GET` → list artifacts (query param: `projectId`)
      - `DELETE` with `templateId` query → delete template
      - `DELETE` with `artifactId` query → delete artifact
      - All handlers use `AppFactory.controllerFactory().deliverables()` and `AppFactory.actor()`.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 16: Create remote functions for client-side access**
      **Files:** `src/lib/remote/deliverables.remote.ts` (create)
      **What:** Create remote functions following the pattern from `src/lib/remote/projects.remote.ts`:
      - `initiateTemplateUpload = command(z.object({ projectId: z.string().uuid(), name: z.string().min(1), mediaType: z.string(), byteSize: z.number(), checksumSha256: z.string() }), ...)`
      - `completeTemplateUpload = command(z.object({ templateId: z.string().uuid() }), ...)`
      - `listTemplates = query(z.string().uuid(), (projectId) => ...)`
      - `deleteTemplate = command(z.object({ templateId: z.string().uuid() }), ...)`
      - `generateDocument = command(z.object({ projectId: z.string().uuid(), noteIds: z.array(z.string().uuid()), title: z.string().min(1), format: z.enum(['docx', 'pdf']), templateId: z.string().uuid().optional() }), ...)`
      - `listArtifacts = query(z.string().uuid(), (projectId) => ...)`
      - `downloadArtifact = command(z.object({ artifactId: z.string().uuid() }), ...)`
      - `deleteArtifact = command(z.object({ artifactId: z.string().uuid() }), ...)`
      - `regenerateArtifact = command(z.object({ artifactId: z.string().uuid() }), ...)`
      - Update `src/lib/remote/resource-queries.ts`: add entries to `toolToDomain` mapping for `initiate_template_upload`, `generate_document`, `delete_template`, `delete_artifact`, `regenerate_artifact` → `invalidateAll`.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 17: Add agent export tools to the tool registry**
      **Files:** `src/lib/server/domain/agent-tool-registry.ts` (modify)
      **What:** Read the current agent tool registry to understand its structure. Add two new agent tools:
      - `export_document`: Takes `projectId`, `noteIds` (array), `title`, `format` (`'docx' | 'pdf'`), `templateId` (optional). Calls `AppFactory.controllerFactory().deliverables().generateDocument()`. Returns `{ artifactId, downloadUrl }`.
      - `list_artifacts`: Takes `projectId`. Returns list of `ArtifactView`.
      - `list_templates`: Takes `projectId`. Returns list of `ProjectTemplate`.
      - Follow the exact same pattern as existing tools in the registry. Each tool should have a `name`, `description`, `parameters` (Zod schema), and `execute` function.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 18: Create the artifacts workspace page**
      **Files:** `src/routes/(app)/artifacts/+page.server.ts` (create), `src/routes/(app)/artifacts/+page.svelte` (create)
      **What:**
      - `+page.server.ts`: Server load function. Get the active project from the shell context (follow `src/routes/(app)/todos/+page.server.ts` pattern). Load artifacts list and templates list.
      - `+page.svelte`: Page component with:
        - Header: "Artifacts" title
        - If no artifacts exist, an empty state with illustration text: "No artifacts yet. Export a document from a note or project to get started."
        - Artifacts list: each item shows title, format badge (DOCX/PDF), source note count, creation date. Clicking expands a detail panel showing provenance info (source notes, template used, agent run if applicable).
        - Action buttons per artifact: Download, Regenerate (if source notes exist), Delete (with confirmation dialog using existing shadcn-svelte dialog).
        - Follow the design patterns from `DESIGN_SYSTEM.md` and existing page components.
      **Verify:** `pnpm typecheck` passes. Run dev server and navigate to `/artifacts` — page renders without errors.

- [ ] **Step 19: Add artifacts to sidebar navigation**
      **Files:** `src/lib/components/app/app-sidebar.svelte` (modify)
      **What:** Add a new item to the `secondaryItems` array:
      ```ts
      { href: '/artifacts', label: 'Artifacts', icon: PackageOpen, badge: 0 }
      ```
      Import `PackageOpen` from `@lucide/svelte/icons/package-open` (or use a different relevant icon like `FileOutput`, `FileArchive`, or `FolderOutput`).
      **Verify:** `pnpm typecheck` passes. Dev server shows Artifacts in the sidebar.

- [ ] **Step 20: Add export UI to the note editor**
      **Files:** `src/lib/components/edra/Export.svelte` (modify), or create `src/lib/components/app/export-dialog.svelte` (create)
      **What:** Add a new export dialog component. When triggered:
      - Open a dialog with: title input (pre-filled with note title), format selector (DOCX/PDF radio buttons), template selector (dropdown listing available templates for the project, with "No template" option), a generate button.
      - On generate: call the `generateDocument` remote function, show loading state, then present a download link.
      - Follow shadcn-svelte Dialog pattern.
      - The dialog should be a reusable component that can be invoked from multiple entry points.
      **Verify:** `pnpm typecheck` passes. Manual test: open a note, click Export, generate a DOCX — download link appears.

- [ ] **Step 21: Add export UI to the project overview page**
      **Files:** `src/routes/(app)/projects/[id]/+page.svelte` (modify)
      **What:** Add an "Export" button to the project page header. Clicking opens the same export dialog component, but with multi-note selection support (checkboxes in the note tree or a multi-select UI).
      **Verify:** `pnpm typecheck` passes. Manual test: navigate to a project, export multiple notes as PDF.

- [ ] **Step 22: Add export tool call rendering in agent chat**
      **Files:** `src/lib/components/app/agent/` (find relevant files for rendering tool results in chat)
      **What:** When an agent calls the `export_document` tool, render a rich card in the chat showing:
      - Document title, format icon (DOCX or PDF)
      - "Download" button linking to the download URL
      - "View in Artifacts" link to `/artifacts`
      - Follow the existing pattern for how agent tool results are rendered in chat.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 23: Create an S3 storage helper for artifacts and templates**
      **Files:** `src/lib/server/domain/` (modify or create new utility)
      **What:** Ensure the existing `StorageService` (from the attachment system) supports the new S3 paths:
      - Template staging: `staging/${userId}/templates/${templateId}`
      - Template permanent: `projects/${projectId}/templates/${templateId}`
      - Artifacts: `artifacts/${userId}/${artifactId}`
      - Read the existing storage service (`src/lib/server/domain/attachment-storage.ts`) to understand the interface. If it needs extension for non-attachment paths, add new methods or use the existing `promote`/`presignUpload`/`presignDownload` methods with the new S3 prefixes.
      - If the existing `StorageService` is tightly coupled to attachments, create a parallel `ArtifactStorageService` interface and S3 implementation following the same pattern but with artifact/template key structures.
      **Verify:** `pnpm typecheck` passes.

- [ ] **Step 24: Integration test — generate a DOCX end-to-end**
      **Files:** `tests/deliverables.integration.test.ts` (create)
      **What:** Using Vitest + testcontainers (follow existing test patterns), write an integration test:
      - Setup: create a project, create a note with ProseMirror content (paragraph + heading), upload a minimal DOCX template, extract styles
      - Generate a DOCX using the artifact management service
      - Verify: the DOCX buffer is non-empty, the S3 object exists, the artifact DB record exists with correct sourceNoteIds
      - Clean up: delete the S3 objects
      **Verify:** `pnpm t -- --run tests/deliverables.integration.test.ts` passes.

- [ ] **Step 25: Run full typecheck and lint**
      **What:** Run `pnpm typecheck && pnpm lint` to ensure no regressions.
      **Verify:** Both commands exit clean with zero errors.

---

## Verification

**End-to-end user flow to verify manually:**

1. Navigate to a project → upload a branded DOCX template via project settings or the export dialog
2. Open a note → click Export → choose DOCX format → select template → generate
3. Download the DOCX, open in Word/LibreOffice — confirm fonts, headings, margins match the template
4. Repeat for PDF export (no template needed) — confirm readable PDF with correct content structure
5. Navigate to `/artifacts` — confirm both artifacts are listed with correct metadata
6. From artifacts page: download, regenerate, delete — confirm all work
7. Ask the agent (in chat) to "export the project notes as a PDF" — confirm the agent calls the export tool and produces a downloadable artifact

**Commands:**
```bash
pnpm exec drizzle-kit generate   # after schema changes
pnpm typecheck                    # type safety
pnpm lint                         # code style
pnpm t -- --run                   # all tests
```
