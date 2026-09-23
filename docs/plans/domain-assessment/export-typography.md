# Export typography preparation

prepareExport resolves common heading spacing before either renderer runs. PreparedExport carries
explicit point-valued overrides for h1 and h2. PDF uses those points; DOCX converts them to twips.
Other heading levels retain each format's existing native spacing. The former headingSpacingPt
model function is removed. Models describe the resolved spacing value and prepared export input.

The actual entry paths are Deliverables document generation, bundle generation, regeneration and
inline PDF export, plus Todos.exportBoardPdf. Their factories already use the same prepareExport
function. No new collaboration port or alternate preparation path is introduced. Both renderers
receive the required map, including when called directly by their artifact tests.

## Guarantees and test dispositions

Keep the generated DOCX checks for h1's 360-twip spacing, h2's 300-twip spacing and native deeper
heading styles. Keep the PDF artifact, Unicode/font, image and table checks. Keep controller export
atomicity, current asset preparation, bundle and board-export tests. These tests continue through the
real preparation function and renderers; no test is replaced with a check that a helper was called.

This is an ownership change with the same exported layout. Public requests, files, template semantics
and database schema do not change. Geometry readers/constructors retain their separate disposition in
[export geometry](export-geometry.md). Other deliverables declarations and workflow review remain open.
