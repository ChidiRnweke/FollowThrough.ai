import { expect, it } from 'vitest';
import { workspaceAccountHint } from './account-hint';

it('reads the non-secret account hint independently of the authentication cookie', () => {
	const accountId = 'a0000000-0000-4000-8000-000000000001';
	expect(workspaceAccountHint(`theme=dark; workspace_account=${accountId}`)).toBe(accountId);
});
