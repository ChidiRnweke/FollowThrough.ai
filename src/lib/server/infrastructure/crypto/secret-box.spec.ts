import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');

describe('SecretBox', () => {
	it('opens what it sealed, and seals each value with a fresh IV', () => {
		const box = SecretBox.fromKeyring(`v1:${key(1)}`);
		const first = box.seal('refresh-token', 'connector:a:user:credential');
		const second = box.seal('refresh-token', 'connector:a:user:credential');
		expect({
			opened: box.open(first, 'connector:a:user:credential'),
			differ: first !== second,
			keyId: first.split('.')[0]
		}).toEqual({
			opened: { kind: 'opened', plaintext: 'refresh-token' },
			differ: true,
			keyId: 'v1'
		});
	});

	it('refuses a value moved to another row', () => {
		const box = SecretBox.fromKeyring(`v1:${key(1)}`);
		const sealed = box.seal('token', 'connector:a:user-1:credential');
		expect(() => box.open(sealed, 'connector:a:user-2:credential')).toThrow();
	});

	it('refuses a value whose ciphertext was altered', () => {
		const box = SecretBox.fromKeyring(`v1:${key(1)}`);
		const [keyId, iv, body] = box.seal('token', 'ctx').split('.');
		const bytes = Buffer.from(body!, 'base64url');
		bytes[0] = bytes[0]! ^ 1;
		expect(() => box.open(`${keyId}.${iv}.${bytes.toString('base64url')}`, 'ctx')).toThrow();
	});

	it('seals with the newest key and still opens values sealed under an older one', () => {
		const old = SecretBox.fromKeyring(`v1:${key(1)}`);
		const rotated = SecretBox.fromKeyring(`v2:${key(2)},v1:${key(1)}`);
		const legacy = old.seal('legacy', 'ctx');
		expect({
			legacy: rotated.open(legacy, 'ctx'),
			newKey: rotated.seal('fresh', 'ctx').split('.')[0]
		}).toEqual({ legacy: { kind: 'opened', plaintext: 'legacy' }, newKey: 'v2' });
	});

	it('reports a value under a key it no longer holds without throwing', () => {
		const sealed = SecretBox.fromKeyring(`v1:${key(1)}`).seal('token', 'ctx');
		expect(SecretBox.fromKeyring(`v2:${key(2)}`).open(sealed, 'ctx')).toEqual({
			kind: 'unknown_key',
			keyId: 'v1'
		});
	});

	it('rejects a keyring that cannot encrypt safely', () => {
		const shortKey = Buffer.alloc(16).toString('base64');
		for (const keyring of [' , ', `v1:${shortKey}`, key(1), `v1:${key(1)},v1:${key(2)}`])
			expect(() => SecretBox.fromKeyring(keyring)).toThrow();
	});
});
