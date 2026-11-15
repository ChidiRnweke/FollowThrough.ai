import type AdmZip from 'adm-zip';
import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Reads ZIP entries against one budget of expanded bytes that every entry of a package
 * draws from.
 *
 * adm-zip caps inflation at the size an entry declares, and only when that size is above
 * zero, so an entry that declares no size expands without bound. This reader inflates the
 * compressed bytes itself, stops at what the budget has left, and then verifies the result
 * against the size and CRC-32 that the central directory declares.
 */

/** Compression methods from the ZIP application note, section 4.4.5. */
const STORED = 0;
const DEFLATED = 8;

export type ZipEntryFailure =
	'over_budget' | 'unsupported_method' | 'corrupt_data' | 'size_mismatch' | 'crc_mismatch';

export type ZipEntryRead =
	| { readonly kind: 'read'; readonly bytes: Buffer }
	| { readonly kind: 'failure'; readonly reason: ZipEntryFailure };

type Expansion =
	| { readonly kind: 'expanded'; readonly bytes: Buffer }
	| { readonly kind: 'failure'; readonly reason: ZipEntryFailure };

type CompressedData =
	| { readonly kind: 'compressed'; readonly bytes: Buffer }
	| { readonly kind: 'failure'; readonly reason: 'corrupt_data' };

const compressedData = (entry: AdmZip.IZipEntry): CompressedData => {
	try {
		return { kind: 'compressed', bytes: entry.getCompressedData() };
	} catch {
		// adm-zip throws when the local header the central directory points at is missing.
		return { kind: 'failure', reason: 'corrupt_data' };
	}
};

/** zlib refuses a zero output limit, so an empty budget admits one byte and fails the count. */
const inflate = (raw: Buffer, remaining: number): Expansion => {
	try {
		return {
			kind: 'expanded',
			bytes: inflateRawSync(raw, { maxOutputLength: Math.max(remaining, 1) })
		};
	} catch (error) {
		const outputLimit =
			error instanceof RangeError && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE';
		return { kind: 'failure', reason: outputLimit ? 'over_budget' : 'corrupt_data' };
	}
};

const expand = (entry: AdmZip.IZipEntry, raw: Buffer, remaining: number): Expansion => {
	// adm-zip writes an empty file as no data at all, whatever method its header names.
	if (raw.length === 0) return { kind: 'expanded', bytes: raw };
	switch (entry.header.method) {
		case STORED:
			return { kind: 'expanded', bytes: raw };
		case DEFLATED:
			return inflate(raw, remaining);
		default:
			return { kind: 'failure', reason: 'unsupported_method' };
	}
};

/** One package's entries, read within `maxExpandedBytes` in total. Use one per package. */
export class BoundedZipReader {
	private expanded = 0;

	constructor(private readonly maxExpandedBytes: number) {}

	read(entry: AdmZip.IZipEntry): ZipEntryRead {
		const raw = compressedData(entry);
		if (raw.kind === 'failure') return raw;
		const remaining = this.maxExpandedBytes - this.expanded;
		const result = expand(entry, raw.bytes, remaining);
		if (result.kind === 'failure') return result;
		const bytes = result.bytes;
		if (bytes.length > remaining) return { kind: 'failure', reason: 'over_budget' };
		this.expanded += bytes.length;
		if (bytes.length !== entry.header.size) return { kind: 'failure', reason: 'size_mismatch' };
		if (crc32(bytes) !== entry.header.crc) return { kind: 'failure', reason: 'crc_mismatch' };
		return { kind: 'read', bytes };
	}
}
