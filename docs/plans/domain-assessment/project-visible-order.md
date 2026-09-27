# Visible positions in project moves

The sidebar passes positions among the notes and folders it displays. The project overview and the
agent's project tree also omit skill documents. ProjectCatalog.readForMove correctly retains all active
records while holding the project lock, but the placement decision previously interpreted the requested
position among that full set. Built-in skills installed in an Inbox could therefore shift every requested
visible position. Moving the first visible note below the second could leave both in their original order.

Translate an ordinary note or folder's requested position through visible target siblings before
inserting it into the complete stored sibling list. Hidden skills remain stored and participate in
contiguous position writes; their identities, metadata and bodies are not deleted. Source-gap closure,
destination relative order, subtree preservation and project locking keep their existing owners.
Direct skill moves preserve their existing full-sibling position semantics. The agent tool description
now states that note/folder positions are zero-based positions in the visible project tree.

The returned entry still carries its actual persisted position, as other note records do. The requested
visible index and that storage position can differ when hidden skills precede it. This requires no
migration and does not split the sibling list into competing storage models.

## Evidence and test disposition

Two real Projects/ProjectCatalog regressions failed before the repair: same-parent reorder with a hidden
leading skill, and moving a child to the end of a visible root list. Retain hidden-record preservation,
interleaved hidden siblings, and direct-skill move compatibility cases. Existing placement tests continue
to cover invalid parents, descendant refusal, source-gap closure and subtree preservation.

The PostgreSQL contracts provision real built-in skills before creating ordinary entries. They check
Inbox reorder, a child moved to the root, and nested visible reorder with a retained skill. Existing
project-tree lock-race contracts remain; this change does not replace them with fake concurrency.

Browser captures render the actual ProjectTree using the controller's resulting projection from an
in-memory repository. The identical request moves First note below Second note. Before, their order
remains First/Second. After, it is Second/First. These are seeded post-command component states, not a
pointer-drag or authenticated database-backed browser run. The temporary result-generation spec and
surface fixture are removed before validation and commit.

This advances W03.06–W03.07. Drag/drop request overlap, optimistic override cleanup and refresh-failure
presentation still need their own interaction review before those workflows are marked complete.
