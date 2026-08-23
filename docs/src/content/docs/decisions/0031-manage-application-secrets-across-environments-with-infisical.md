---
title: "ADR 0031: Manage application secrets across environments with Infisical"
description: Give the app, worker, and provisioning one rotatable source of application secrets.
---

# ADR 0031: Manage application secrets across environments with Infisical

## Status

Accepted.

## Context

The application, worker, and provisioning scripts share database, storage, model, and OCR secrets.
Those values differ by environment and need rotation outside an application build.

The maintainer already operates Infisical for other projects. It is open source and provides one
place to manage these values.

Some self-hosters need a smaller setup and already manage process environment variables.

## Decision

We chose managed multi-environment secrets and rotation as the requirement. Infisical is the
default provider for the maintained deployment.

The process environment holds only the values needed to reach Infisical and platform settings that
must exist before application startup. Application secrets are loaded before the server starts.

Plain environment variables remain a supported mode for a simple self-hosted deployment.

## Consequences

- Web, worker, and provisioning can read one managed set of application secrets.
- Secrets can rotate without rebuilding the image.
- Missing required secrets fail startup instead of becoming empty settings.
- The default path adds an Infisical dependency and reflects the maintainer's operations.
- Environment mode keeps a simpler path but moves rotation to the operator.

## Evidence

- `src/lib/server/config.ts` implements Infisical and environment backends.
- Configuration loads before the SvelteKit server is imported.
- Provisioning writes the generated database connection back to Infisical.
- Self-hosting docs describe both configuration modes.
