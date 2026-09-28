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
 * `SIDEBAR_WIDTH_DEFAULT_PX` in workspace models and the shared sidebar-width service.
 * The mobile sheet stays fixed: there is no rail to drag below `sm`. It is wide
 * enough for the icon rail plus a readable project panel.
 */
export const SIDEBAR_WIDTH_MOBILE = '20rem';
/**
 * The inset variant's icon rail: always on screen, and all that remains when the
 * panel collapses. Mirrors `SIDEBAR_RAIL_PX` in the workspace models.
 */
export const SIDEBAR_WIDTH_ICON = '3.5rem';
/**
 * Deliberately not shadcn's default `b`: inside the note editor Ctrl/⌘+B is bold, and
 * both listeners fired on every press. Backslash matches the VS Code panel toggle and
 * collides with nothing in the editor.
 */
export const SIDEBAR_KEYBOARD_SHORTCUT = '\\';
