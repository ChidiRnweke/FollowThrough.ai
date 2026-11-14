import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for user credentials at rest (ADR 0049).
 *
 * AES-256-GCM with a fresh 96-bit IV per value. The `context` is the associated
 * data: it names the row and field a value belongs to, so a ciphertext copied
 * into another row fails to open instead of becoming another user's credential.
 *
 * A sealed value is `<keyId>.<iv>.<ciphertext+tag>`, base64url. The keyring lists
 * keys newest first: the first one seals, every one opens, which lets an
 * operator rotate by prepending a key and removing the old one once no value
 * names it.
 */
export type SecretOpening =
	| { readonly kind: 'opened'; readonly plaintext: string }
	/** Sealed under a key this keyring does not hold. The value is intact; this deployment cannot read it. */
	| { readonly kind: 'unknown_key'; readonly keyId: string };

export interface SecretSealing {
	seal(plaintext: string, context: string): string;
	/** Throws when the value was altered or belongs to another context. */
	open(sealed: string, context: string): SecretOpening;
}

const KEY_ID = /^[a-z0-9]{1,16}$/;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox implements SecretSealing {
	private constructor(private readonly keys: ReadonlyMap<string, Buffer>) {}

	/** Parses `CONNECTOR_SECRET_KEYS`: comma-separated `<keyId>:<base64 32-byte key>`, newest first. */
	static fromKeyring(keyring: string): SecretBox {
		const entries = keyring
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
		if (entries.length === 0) throw new Error('CONNECTOR_SECRET_KEYS names no key.');
		const keys = new Map<string, Buffer>();
		for (const entry of entries) {
			const separator = entry.indexOf(':');
			const keyId = entry.slice(0, separator);
			const key = Buffer.from(entry.slice(separator + 1), 'base64');
			if (separator < 1 || !KEY_ID.test(keyId))
				throw new Error(
					'Each CONNECTOR_SECRET_KEYS entry must be <keyId>:<key>, with a key id of 1-16 lowercase letters or digits.'
				);
			if (key.length !== KEY_BYTES)
				throw new Error(`CONNECTOR_SECRET_KEYS key ${keyId} must be ${KEY_BYTES} bytes, base64.`);
			if (keys.has(keyId)) throw new Error(`CONNECTOR_SECRET_KEYS names key ${keyId} twice.`);
			keys.set(keyId, key);
		}
		return new SecretBox(keys);
	}

	seal(plaintext: string, context: string): string {
		const [keyId, key] = this.keys.entries().next().value!;
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		cipher.setAAD(Buffer.from(context, 'utf8'));
		const body = Buffer.concat([
			cipher.update(plaintext, 'utf8'),
			cipher.final(),
			cipher.getAuthTag()
		]);
		return `${keyId}.${iv.toString('base64url')}.${body.toString('base64url')}`;
	}

	open(sealed: string, context: string): SecretOpening {
		const [keyId, iv, body, ...rest] = sealed.split('.');
		if (!keyId || !iv || !body || rest.length > 0) throw new Error('A sealed secret is malformed.');
		const key = this.keys.get(keyId);
		if (!key) return { kind: 'unknown_key', keyId };
		const bytes = Buffer.from(body, 'base64url');
		if (bytes.length < TAG_BYTES) throw new Error('A sealed secret is malformed.');
		const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
		decipher.setAAD(Buffer.from(context, 'utf8'));
		decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
		const plaintext = Buffer.concat([
			decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)),
			decipher.final()
		]).toString('utf8');
		return { kind: 'opened', plaintext };
	}
}
