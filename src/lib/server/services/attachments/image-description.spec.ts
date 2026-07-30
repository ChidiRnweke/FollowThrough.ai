import { describe, expect, it } from 'vitest';
import { ImageDescription } from './image-description';

describe('ImageDescription', () => {
	it('is available as a domain service', () => {
		expect(ImageDescription).toBeTypeOf('function');
	});
});
