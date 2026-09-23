import { expect, it } from 'vitest';
import type { ConversationImageInput } from '$lib/models/agent';
import { prepareRunImages, validateRunImages } from './images';

const image: ConversationImageInput = {
	id: '40000000-0000-4000-8000-000000018001',
	name: 'pixel.png',
	mediaType: 'image/png',
	dataUrl:
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
};

it('keeps attached and app-supplied images in the same native input in that order', () => {
	const contextImage = { ...image, id: '40000000-0000-4000-8000-000000018002' };
	expect(prepareRunImages({ images: [image], contextImages: [contextImage] })).toEqual({
		kind: 'native',
		images: [image, contextImage]
	});
});

it('resolves a saved fallback reader for app-supplied images', () => {
	expect(prepareRunImages({ contextImages: [image], visionModelOverride: 'test/vision' })).toEqual({
		kind: 'describe',
		images: [image],
		model: 'test/vision'
	});
});

it('does not invoke an image reader on a turn without images', () => {
	expect(prepareRunImages({ visionModelOverride: 'test/vision' })).toEqual({ kind: 'none' });
});

it('rejects a data URL that disagrees with the declared media type', () => {
	expect(() =>
		validateRunImages({ images: [{ ...image, dataUrl: 'data:image/jpeg;base64,aGVsbG8=' }] })
	).toThrow('does not match');
});

it('applies the byte budget to both image channels together', () => {
	const dataUrl = `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024).toString('base64')}`;
	expect(() =>
		validateRunImages({
			images: [{ ...image, dataUrl }],
			contextImages: [{ ...image, id: '40000000-0000-4000-8000-000000018002', dataUrl }]
		})
	).toThrow('10 MiB combined');
});
