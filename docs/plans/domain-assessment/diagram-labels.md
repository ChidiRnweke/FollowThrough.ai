# Draw.io label ownership

Visible labels are ordered words read from mxCell, object and UserObject attributes. XML/HTML
decoding is a boundary responsibility. Whitespace normalization, removal of empty labels, first-seen
deduplication, searchable newline text and added/removed/kept comparison are shared rules.

The model keeps DrawioLabelDiff and the canonical drawioLabelValues attribute reader. The latter
only returns present XML attribute values from a parsed document. It does not decode HTML, normalize
words or choose labels for search. HtmlTextDecoder and the mixed drawioLabels function are removed.
Normalization and comparison live in services/diagrams/labels.

The browser reader decodes HTML with the browser DOM and applies the shared rule. The server's
DrawioLabelReader decodes with jsdom and closes its windows. DiagramStudio and Suggestions apply
the shared rules to those decoded values when creating, publishing, reading and accepting diagrams.
The approval preview uses the same comparison owner. Neither server service calls another service.
The old DrawioLabelExtractor/DrawioDiagramTextExtractor pair, its service construction, duplicate
factory instances and redundant ports are removed. Mermaid extraction remains separate.

## Guarantees and test dispositions

Keep XML validation, SVG sanitization, proposal acceptance, indexing and revision contracts. Rewrite
the server extraction test to assert decoded boundary values. Add shared-rule tests for ordered
deduplication, whitespace/empty labels, searchable text and edit comparison. Preserve the seven browser
approval tests for creation, additions, removals, kept counts, missing baselines, unreadable XML and rich HTML.

A shared valid XML fixture contains a rich object label, a repeated cell label, an HTML nonbreaking
space and a second label. The browser reader and real server publication both produce Browser then
Queue. This verifies parity through their different parsers, not only an isolated array algorithm.
UI appearance, public commands and persisted label semantics do not change. Complete W13 workflow
and model-declaration review remains separate from this rule-ownership disposition.
