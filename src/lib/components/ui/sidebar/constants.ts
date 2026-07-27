export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = '16rem';
export const SIDEBAR_WIDTH_MOBILE = '18rem';
export const SIDEBAR_WIDTH_ICON = '3rem';
/**
 * Deliberately not shadcn's default `b`: inside the note editor Ctrl/⌘+B is bold, and
 * both listeners fired on every press. Backslash matches the VS Code panel toggle and
 * collides with nothing in the editor.
 */
export const SIDEBAR_KEYBOARD_SHORTCUT = '\\';
