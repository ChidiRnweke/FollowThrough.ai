import { createHash } from 'node:crypto';

/**
 * Lowercase hex SHA-256 of a UTF-8 string. For high-entropy random secrets (session tokens, OAuth
 * codes and tokens), not passwords: a single digest is not reversible, and the lookup by digest
 * stays an index read.
 */
export const sha256Hex = (value: string): string =>
	createHash('sha256').update(value).digest('hex');
