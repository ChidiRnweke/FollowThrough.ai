# Note-less project proposals after archival

Memory.propose creates project memory suggestions without a source note. SuggestionRecords.list
previously derived project visibility only through the source note's project. As a result, these
proposals remained in the server inbox after their project was archived, even though ADR 0009 hides
the project's content and the memory write boundary now rejects their application.

The list query now also excludes a proposal whose payload identifies an archived project. The
existing source-note project check remains. Profile proposals have no project ID and remain visible.
Active project proposals also remain visible. Single-record history and decision reads retain the
stored proposal; no proposal is deleted or changed by project archival.

Compare the stored project key as lowercase text, since valid UUID input can use uppercase letters. Casting untrusted JSON to UUID inside the visibility query
would make one malformed old row break the entire list before the mapper could report it. The
existing readable/unreadable storage boundary remains responsible for parsing the payload.

Add PostgreSQL contracts for a note-less archived project proposal, active/profile controls, retained
history, a valid uppercase UUID and an invalid stored project key beside a valid proposal. Keep source-note archive and
mixed readable/unreadable contracts. Local Docker is unavailable; the new SQL contracts require CI.

This repairs the server list path in W10.04 and W11.05. Browser summary counts and the complete
proposal presentation review remain separate; this slice does not mark either workflow complete.
