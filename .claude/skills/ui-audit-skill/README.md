# UI Audit Skill

A portable, human-first UI audit skill for coding agents using Playwright MCP.

## Install

Copy the `ui-audit-skill` folder into the skills directory supported by your agent, keeping `SKILL.md` at the skill root. Common locations include `.agents/skills/ui-audit/` or the equivalent configured by your client.

## Run

Ask the agent to run the UI audit against the local application. The required order is:

1. list `src/routes` or equivalent with `ls`, `find`, or `tree` only,
2. create a provisional screen inventory without opening source files,
3. assign each screen to an isolated screen-review subagent,
4. have each subagent enter the product like a user, take screenshots, record first impressions, and infer expected interactions,
5. freeze those expectations,
6. test hover, keyboard, drag, filters, dialogs, errors, responsive states, and other applicable interactions in the browser,
7. only then inspect relevant implementation code when needed,
8. synthesize an actionable `artifacts/ui-audit/UI_AUDIT.md`,
9. end the report with concrete UI component-test recommendations.

The initial repository pass is deliberately directory-only. The agent must not use `cat`, `sed`, `grep`, editor previews, AST tools, or other content-reading methods before the expected-interaction freeze.

The `examples/WORKBENCH_SAMPLE_AUDIT.md` file shows the expected sensitivity to decorative card rails, weak card hierarchy, detached group actions, text overflow, and board interactions.
