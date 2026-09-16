# Skill body approval

These captures render the actual ToolApprovalCard with the application's CSS. They use a synthetic
pending edit_skill call for the skill "Release checklist": replace "Monday" with "Tuesday" in
"Check every release on Monday." The reviewed base is revision 3. The viewport is 900 × 700 in
light mode.

- Before: the existing card receives the pending arguments without a saved review. It shows the
  two replacement strings and enables approval.
- After: the pending call also carries its prepared review. The card names the skill, shows the
  complete before/after text and identifies the reviewed revision.

Reproduce with the component fixture server:
`pnpm exec vite dev --config vite.surface-text.config.ts --host 127.0.0.1 --port 5174`.
Point the fixture page at ToolApprovalCard with the values above and disable SSR, matching the
application workspace. The temporary capture fixture was removed after verification.

This is a seeded component check, not a live model conversation. The browser tests also verify
that older skill approvals without a saved review disable individual and grouped approval.
