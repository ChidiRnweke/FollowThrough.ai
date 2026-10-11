import { widgetComputedRoots, widgetDataSchema } from '$lib/models/widgets';

/** Strip json-render's computed roots and read the control snapshot at its protocol boundary. */
export const readWidgetControlData = (state: unknown) => {
	if (typeof state !== 'object' || state === null || Array.isArray(state))
		return widgetDataSchema.safeParse(state);
	return widgetDataSchema.safeParse(
		Object.fromEntries(
			Object.entries(state).filter(
				([key]) => !(widgetComputedRoots as readonly string[]).includes(key)
			)
		)
	);
};
