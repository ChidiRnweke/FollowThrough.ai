# Session lifetime and browser cookie renewal

W01.05 follows SignIn through SessionRegistry, SessionRecords, the OAuth callback, request hooks and
the browser cookie. SessionRegistry is the single owner of session creation, validation, renewal and
logout. Session records carry a random 256-bit ID, user ID and expiry. They are separate from API
tokens and from the non-secret workspace-account hint used by the offline shell.

A new session lasts thirty days. Validation returns no identity for a missing session, deletes an
expired session, and extends a session by thirty days when fifteen days or less remain. The current
user record supplies the role on each validation. Storage failures propagate instead of returning a
successful authentication or logout. The request hook supplies only the validated user to downstream
request context; role gating is a separate workflow.

## Reproduced cookie gap

The OAuth callback set a thirty-day cookie once. Request hooks used the renewed user identity but
ignored the renewed session expiry. The browser therefore discarded its credential at the original
deadline even when the database session was still valid. The offline account hint already had a
separate renewal path and did not repair the authenticated credential.

Validated requests now issue the session cookie using the stored expiry. The OAuth callback uses the
same stored deadline. The cookie helper converts the remaining lifetime to whole seconds, clamps an
already-expired deadline to immediate expiry, and keeps HttpOnly, Secure on HTTPS, SameSite=Lax and
root path. Reissuing a cookie before the database renewal boundary does not invent a new thirty-day
deadline. The database remains authoritative when validating every request.

For example, a day-zero session expires on day thirty. Validation on day fifteen extends the stored
session to day forty-five. A response on day sixteen now sets twenty-nine days of cookie lifetime,
so browser and database still agree on day forty-five.

## Test disposition

Keep the eleven SessionRegistry tests for creation, identifier independence, missing/expired rows,
exact renewal and expiry boundaries, persisted renewal, logout and storage failures. Keep the real
sign-in composition tests that create a session ordinary request validation can read. Keep workspace
account-cookie tests; that public hint has a different purpose and must not become the credential.

Add three cookie/session composition regressions. Before the change, all three failed because the
helper always chose thirty days. They now check an unrenewed session's original deadline, a renewed
session's later deadline and immediate expiry of an elapsed deadline. The tests retain the private
cookie attributes. The hook and callback both pass the validated/persisted session deadline.

W01.05 is assessed. This work does not claim a live Authentik sign-in or a full browser session held
for several weeks; the lifetime scenarios use the real registry and a deterministic clock. OAuth
callback security, account linking, role routing, API tokens and account detachment retain their
separate workflow reviews.
