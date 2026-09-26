# Memory classification during proposal replacement

A memory's optional type records whether it is a fact, decision, constraint or preference. A proposed
content update does not offer a type change. Direct edits preserve the type when none is supplied,
but proposal replacement copied scope and sharing while omitting the existing type. Accepting new
content therefore erased the user's classification.

Preserve the target's type in the replacement entry. An unclassified entry stays unclassified.
The existing replacement identity, source, privacy and undo effects remain the same.

Add four regressions for the classified cases and a control for an unclassified entry. Keep the
existing replacement lineage, effect preimage, scope and sharing tests. Add a PostgreSQL contract
for the classification on the active replacement. This is a retained-data correction in W11.04,
W11.05 and W11.06; it does not change the proposal schema or introduce a type-selection feature.

All four classified cases failed before the correction. After it, the five new cases and the
focused memory/effect suite passed: seven files and 64 tests. The SQL contract requires CI because
Docker is unavailable locally.
