export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
/**
 * The user's preferred sidebar width in pixels. A cookie rather than localStorage
 * so the shell's first paint is already at the chosen width instead of flashing
 * the default and settling on hydration.
 */
export const SIDEBAR_WIDTH_COOKIE_NAME = 'sidebar_width';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
/**
 * The desktop width is no longer a constant — it is the user's resizable
 * preference, clamped against the shell's space budget. See
 * `SIDEBAR_WIDTH_DEFAULT_PX` and `effectiveSidebarWidth` in `$lib/models/workspace`.
 * The mobile sheet stays fixed: there is no rail to drag below `sm`.
 */
export const SIDEBAR_WIDTH_MOBILE = '18rem';
export const SIDEBAR_WIDTH_ICON = '3rem';
/**
 * Deliberately not shadcn's default `b`: inside the note editor Ctrl/⌘+B is bold, and
 * both listeners fired on every press. Backslash matches the VS Code panel toggle and
 * collides with nothing in the editor.
 */
export const SIDEBAR_KEYBOARD_SHORTCUT = '\\';
