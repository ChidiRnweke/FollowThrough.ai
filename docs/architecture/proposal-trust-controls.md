# Effective proposal auto-accept controls

The task extraction and memory controllers consult the user's proposal trust policy. Note link and
reference controllers do not automatically apply their proposals. Reference auto-acceptance was
also explicitly disabled in the evaluator. Chat tool approval uses execution mode and tool
classification, as documented by ADR 0003; tool availability follows ADR 0027.

The settings UI and agent tool now offer only extracted task and memory policies. The service lists
only those effective controls and rejects writes to unsupported kinds. Stored historical rows are
preserved. Old queued workspace commands remain readable and receive an explicit rejection rather
than silently storing a setting with no effect. Their rejection does not enable or apply a proposal.

The confidence threshold is inclusive. Both the evaluator test and UI caption state that a proposal
at the configured percentage qualifies. A policy still needs to be enabled.

The before/after evidence renders the actual policy control components at 900 × 750 in light mode.
The same user starts with review required. The former five-row collection included three ineffective
auto-accept controls and omitted a memory description. The result contains two named workflows with
descriptions. These are component captures, not an authenticated settings-page test.
