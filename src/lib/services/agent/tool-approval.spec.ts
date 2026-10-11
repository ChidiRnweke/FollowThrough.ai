import { expect, it } from 'vitest';
import { AgentToolApprovalRules } from './tool-approval';
it.each([
	['mutation', 'approval_required', 'approval_required'],
	['mutation', 'auto_accept', 'ready'],
	['read', 'approval_required', 'ready'],
	['proposal', 'approval_required', 'ready']
] as const)('classifies %s in %s as %s', (classification, mode, expected) => {
	expect(new AgentToolApprovalRules().requirement(classification, mode)).toBe(expected);
});
