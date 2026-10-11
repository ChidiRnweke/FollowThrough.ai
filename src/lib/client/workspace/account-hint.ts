import {
	workspaceAccountCookieName,
	workspaceBootstrapSchema
} from '$lib/models/workspace-bootstrap';

/** This readable cookie is only an account hint; every server request still authenticates normally. */
export const workspaceAccountHint = (cookies: string): string | null => {
	const prefix = `${workspaceAccountCookieName}=`;
	const found = cookies
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));
	if (!found) return null;
	const account = workspaceBootstrapSchema.shape.accountId.safeParse(found.slice(prefix.length));
	return account.success ? account.data : null;
};
