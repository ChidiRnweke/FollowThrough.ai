/** Read authenticated local images or CORS-enabled external images into validated, portable PNGs. */
export async function readClipboardImage(source: string): Promise<Blob> {
	const url = new URL(source, window.location.origin);
	const response = await fetch(url.href, {
		credentials: url.origin === window.location.origin ? 'same-origin' : 'omit'
	});
	if (!response.ok) throw new Error(`The image request failed (${response.status})`);
	const blob = await response.blob();
	if (!blob.type.startsWith('image/')) throw new Error('The image request did not return an image');
	const bitmap = await createImageBitmap(blob);
	try {
		if (blob.type === 'image/png') return blob;
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('The image could not be converted');
		context.drawImage(bitmap, 0, 0);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(png) => (png ? resolve(png) : reject(new Error('The image could not be converted'))),
				'image/png'
			)
		);
	} finally {
		bitmap.close();
	}
}
