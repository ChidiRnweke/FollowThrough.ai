import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The real stylesheet carries the motion, so these specs live apart from the composer's
// behaviour specs, whose popover clicks assume the unstyled layout.
import '../../../../routes/layout.css';
import ChatComposer from './chat-composer.svelte';
import type { AgentModel } from '$lib/models/agent';

const sonnet: AgentModel = {
	id: 'anthropic/claude-sonnet-4.5',
	name: 'Anthropic: Claude Sonnet 4.5',
	provider: 'anthropic',
	supportsTools: true,
	supportsVision: true,
	recommended: true,
	capabilities: ['tools']
};

const flash: AgentModel = {
	id: 'deepseek/deepseek-v4-flash',
	name: 'DeepSeek: V4 Flash',
	provider: 'deepseek',
	supportsTools: true,
	supportsVision: false,
	recommended: true,
	capabilities: ['tools']
};

const base = {
	chips: [],
	mentionCandidates: [],
	highlighted: 0,
	selectedImages: [],
	agentAvailable: true,
	isStreaming: false,
	connection: 'connected',
	executionMode: 'approval_required',
	models: [sonnet, flash],
	modelOverride: null,
	defaultModelId: flash.id,
	visionModelOverride: null,
	defaultVisionModelId: sonnet.id,
	onmodelchange: () => undefined,
	onvisionmodelchange: () => undefined,
	onremovechip: () => undefined,
	onpinselection: () => undefined,
	onpick: () => undefined,
	onhighlight: () => undefined,
	onremoveimage: () => undefined,
	onfiles: () => undefined,
	onkeydown: () => undefined,
	oninput: () => undefined,
	onpaste: () => undefined,
	ontoggleexecutionmode: () => undefined,
	onsend: () => undefined,
	onstop: () => undefined
} as const;

describe('ChatComposer send motion', () => {
	const departing = (root: Element) =>
		[...root.querySelectorAll('svg')].filter(
			(svg) => getComputedStyle(svg).animationName === 'ft-launch'
		).length;

	it('lifts the send arrow off when a message starts streaming', async () => {
		const screen = await render(ChatComposer, { ...base, prompt: 'Summarise the plan' });
		await screen.rerender({ ...base, prompt: '', isStreaming: true });
		await expect.poll(() => departing(screen.container)).toBe(1);
	});

	it('shows the stop square still when the page loads mid-stream', async () => {
		const { container } = await render(ChatComposer, { ...base, isStreaming: true });
		expect(departing(container)).toBe(0);
	});
});
