import { SIDEBAR_WIDTH_DEFAULT_PX } from '$lib/models/workspace';
import type { WorkspacePresentationController } from '$lib/controllers/workspace/presentation';

/**
 * Reads the persisted width from its cookie, falling back to the default for a
 * missing or malformed value. Always returns a width inside the allowed range,
 * so a hand-edited cookie cannot render an unusable shell.
 */
export function parseSidebarWidth(
	presentation: WorkspacePresentationController,
	cookie: string | undefined
): number {
	if (cookie === undefined) return SIDEBAR_WIDTH_DEFAULT_PX;
	return presentation.clampPreferred(Number.parseFloat(cookie));
}
