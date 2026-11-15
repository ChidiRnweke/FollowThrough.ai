import { expect, it } from 'vitest';
import { clientRegistrationRequestSchema, tokenRequestSchema } from './index';

// mcp-grants.ts issues `ftc_`/`ftr_` and 32 random bytes in unpadded base64url: 47 characters.
const issued = (prefix: string) => `${prefix}${'A'.repeat(43)}`;
const verifier = 'v'.repeat(43);
const uri = (length: number) => {
	const origin = 'https://client.example/';
	return origin + 'a'.repeat(length - origin.length);
};

const codeGrant = (overrides: Record<string, string>) => ({
	grant_type: 'authorization_code',
	code: issued('ftc_'),
	redirect_uri: 'https://client.example/callback',
	code_verifier: verifier,
	client_id: 'https://client.example/metadata.json',
	...overrides
});

it('accepts issued credentials and URIs at the limit, and refuses one character past either', () => {
	const accepts = (request: object) => tokenRequestSchema.safeParse(request).success;
	expect({
		issuedCode: accepts(codeGrant({})),
		longerCode: accepts(codeGrant({ code: `${issued('ftc_')}A` })),
		issuedRefresh: accepts({
			grant_type: 'refresh_token',
			refresh_token: issued('ftr_'),
			client_id: 'https://client.example/metadata.json'
		}),
		longerRefresh: accepts({
			grant_type: 'refresh_token',
			refresh_token: `${issued('ftr_')}A`,
			client_id: 'https://client.example/metadata.json'
		}),
		redirectAtLimit: accepts(codeGrant({ redirect_uri: uri(8000) })),
		longerRedirect: accepts(codeGrant({ redirect_uri: uri(8001) })),
		clientIdAtLimit: accepts(codeGrant({ client_id: uri(8000) })),
		longerClientId: accepts(codeGrant({ client_id: uri(8001) }))
	}).toEqual({
		issuedCode: true,
		longerCode: false,
		issuedRefresh: true,
		longerRefresh: false,
		redirectAtLimit: true,
		longerRedirect: false,
		clientIdAtLimit: true,
		longerClientId: false
	});
});

it('refuses a registration past the redirect URI count, URI length or list limits', () => {
	const accepts = (request: object) => clientRegistrationRequestSchema.safeParse(request).success;
	const uris = (count: number) =>
		Array.from({ length: count }, (_, index) => `https://client.example/callback/${index}`);
	expect({
		tenUris: accepts({ redirect_uris: uris(10) }),
		elevenUris: accepts({ redirect_uris: uris(11) }),
		uriAtLimit: accepts({ redirect_uris: [uri(8000)] }),
		longerUri: accepts({ redirect_uris: [uri(8001)] }),
		bothGrants: accepts({
			redirect_uris: uris(1),
			grant_types: ['authorization_code', 'refresh_token']
		}),
		threeGrants: accepts({
			redirect_uris: uris(1),
			grant_types: ['authorization_code', 'refresh_token', 'refresh_token']
		}),
		oneResponseType: accepts({ redirect_uris: uris(1), response_types: ['code'] }),
		twoResponseTypes: accepts({ redirect_uris: uris(1), response_types: ['code', 'code'] })
	}).toEqual({
		tenUris: true,
		elevenUris: false,
		uriAtLimit: true,
		longerUri: false,
		bothGrants: true,
		threeGrants: false,
		oneResponseType: true,
		twoResponseTypes: false
	});
});
