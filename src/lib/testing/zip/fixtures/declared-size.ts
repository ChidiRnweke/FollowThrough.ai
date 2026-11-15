/**
 * Rewrites the uncompressed size one entry declares, in its local header and its central
 * directory record, as a tool writing a dishonest header would. The offsets are those of
 * the ZIP application note, sections 4.3.7, 4.3.12 and 4.3.16.
 */
export const declaringSize = (archive: Uint8Array, name: string, size: number): Uint8Array => {
	const buffer = Buffer.from(archive);
	const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	const count = buffer.readUInt16LE(end + 10);
	let at = buffer.readUInt32LE(end + 16);
	for (let index = 0; index < count; index++) {
		const nameLength = buffer.readUInt16LE(at + 28);
		const extraLength = buffer.readUInt16LE(at + 30);
		const commentLength = buffer.readUInt16LE(at + 32);
		if (buffer.toString('utf8', at + 46, at + 46 + nameLength) === name) {
			buffer.writeUInt32LE(size, at + 24);
			buffer.writeUInt32LE(size, buffer.readUInt32LE(at + 42) + 22);
		}
		at += 46 + nameLength + extraLength + commentLength;
	}
	return new Uint8Array(buffer);
};
