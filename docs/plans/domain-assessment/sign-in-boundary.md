# Sign-in request and callback boundaries

W01.02 starts at GET /auth/login. When authentication is disabled, the route redirects to Today.
Otherwise it clears the browser's account hint, asks SignIn for a PKCE challenge, stores the verifier
in a state-specific HTTP-only cookie and redirects to the configured provider authorization URL.
The state and verifier are independent random URL-safe values. The challenge is the SHA-256 digest of
the verifier. State-specific cookie names allow simultaneous login attempts to retain separate verifiers;
the cookie lasts ten minutes and uses the common path, SameSite and HTTPS options.

The callback rejects a provider error, missing code/state, absent verification cookie and mismatched
stored state before completing sign-in. Malformed cookie data fails explicitly before exchange. The
valid callback removes only its own verification cookie before calling SignIn. The Authentik adapter
sends the authorization code, original verifier and configured callback to the token endpoint, then
uses the returned access token as the user-info bearer credential. External responses are parsed at
that adapter into narrow token/profile types. Services and the controller receive those resolved types.

SignIn orchestrates authorization, account resolution and SessionRegistry. It creates the session only
after the provider exchange, profile read and account resolution succeed. The route sets the session
cookie from the stored session deadline, then redirects to Today. The ordinary request hook validates
the session and applies admission routing. Provider or storage failure does not return a successful
new sign-in. Account creation/linking policy is W01.03 and D08; this review neither changes nor approves
the unresolved email-trust policy.

## Test disposition and limits

Keep the challenge hash/randomness/authorization-URL cases, provider response parsing cases and real
SignIn composition cases. They cover successful session validation, repeated provider identity,
provider token/profile failure and failed session persistence. Keep session renewal and cookie-deadline
coverage from the [session review](session-cookie-renewal.md).

Add cookie cases for simultaneous state isolation, missing state, selective consumption, malformed
JSON/schema and HTTP-only short-lived HTTPS options. Add typed recording-fetch cases for the actual
outbound token/profile requests. These validate a protocol contract, not calls to a mock service. Add
SQL SignIn-to-SessionRegistry cases for persisted authentication and logout invalidation, using real
user/session repositories and synthetic provider HTTP responses. Existing session failure tests remain
necessary; successful SQL round trips do not replace them.

The focused unit suite passed 21 cases. No live provider or full external redirect round trip is
claimed. Callback route branches were traced in source; the cookie and provider boundaries are tested
deterministically. SQL requires CI because local Docker is unavailable. No production behavior or UI
changes in this review.

W01.02 is assessed. Waiting/admitted/admin routing, provider account linking and account-wide browser
logout remain separate workflows. Historical commit 754fe419 intentionally removed the admitted-user
sidebar sign-out control; this review does not silently restore that product decision.
