import { expect, it } from 'vitest';
import { ClientMetadataDocuments } from './client-metadata-documents';

// Every case is refused before a request leaves the machine: by the URL rules, by the
// address-literal check, or by the lookup that resolves `localhost`.
it.each([
	['http://client.example/metadata', 'the client_id must use https'],
	['https://client.example/', 'the client_id must have a path'],
	['https://client.example/metadata#part', 'the client_id must not have a fragment'],
	['https://user:secret@client.example/metadata', 'the client_id must not carry credentials'],
	['https://127.0.0.1/metadata', 'the client_id host is a special-use address'],
	['https://10.1.2.3/metadata', 'the client_id host is a special-use address'],
	['https://169.254.169.254/latest/meta-data', 'the client_id host is a special-use address'],
	['https://[::1]/metadata', 'the client_id host is a special-use address'],
	['https://[::ffff:7f00:1]/metadata', 'the client_id host is a special-use address'],
	['https://[fd00::1]/metadata', 'the client_id host is a special-use address']
])('refuses to fetch %s', async (url, reason) => {
	expect(await new ClientMetadataDocuments().fetch(new URL(url))).toEqual({
		kind: 'failure',
		reason
	});
});

it('refuses a host name that resolves to loopback', async () => {
	const fetched = await new ClientMetadataDocuments().fetch(new URL('https://localhost/metadata'));
	expect(fetched).toEqual({
		kind: 'failure',
		reason:
			'the metadata document could not be fetched: localhost resolves to a special-use address'
	});
});
