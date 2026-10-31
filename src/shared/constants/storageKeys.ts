/** localStorage: TV overscan safe padding (corner controls). */
export const STORAGE_KEY_TV_SAFE_INSET = 'chainduel_tvSafeInset';
/** localStorage: renderer performance settings (JSON, see lib/graphicsSettings). */
export const STORAGE_KEY_GRAPHICS = 'chainduel_graphics';
/** localStorage: where the floating quick-settings button is docked (JSON {side, y}). */
export const STORAGE_KEY_QUICK_MENU_DOCK = 'chainduel_quickMenuDock_v2';
/**
 * sessionStorage: this tab already reloaded once after a missing lazy chunk.
 * Stays set for the tab so a chunk that is actually gone cannot reload in a loop.
 */
export const STORAGE_KEY_CHUNK_RELOAD = 'chainduel_chunkReload';
