import { describe, it, expect } from 'vitest';
import { formatBytes, todoStatusStyle, attachmentStatusStyle } from './labels';

describe('formatBytes', () => {
	it('reports whole bytes without a decimal', () => {
		expect(formatBytes(512)).toBe('512 B');
	});

	it('rounds kilobytes to one decimal', () => {
		expect(formatBytes(113409)).toBe('110.8 KB');
	});

	it('scales into megabytes', () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
	});

	it('treats zero as zero bytes', () => {
		expect(formatBytes(0)).toBe('0 B');
	});
});

describe('todoStatusStyle', () => {
	it('maps done to the success token', () => {
		expect(todoStatusStyle.done.dotClass).toBe('bg-success');
	});

	it('maps in-progress to the warning token', () => {
		expect(todoStatusStyle.in_progress.dotClass).toBe('bg-warning');
	});

	it('keeps cancelled neutral', () => {
		expect(todoStatusStyle.cancelled.badgeClass).toBe('text-muted-foreground');
	});
});

describe('attachmentStatusStyle', () => {
	it('marks ready as success', () => {
		expect(attachmentStatusStyle('ready').dotClass).toBe('bg-success');
	});

	it('marks failed as destructive', () => {
		expect(attachmentStatusStyle('failed').dotClass).toBe('bg-destructive');
	});

	it('marks processing as warning', () => {
		expect(attachmentStatusStyle('processing').dotClass).toBe('bg-warning');
	});
});
