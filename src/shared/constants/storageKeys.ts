/** localStorage: TV overscan safe padding (corner controls). */
export const STORAGE_KEY_TV_SAFE_INSET = 'chainduel_tvSafeInset';
/** localStorage: renderer performance settings (JSON, see lib/graphicsSettings). */
export const STORAGE_KEY_GRAPHICS = 'chainduel_graphics';
/** localStorage: where the floating quick-settings button is docked (JSON {side, y}). */
export const STORAGE_KEY_QUICK_MENU_DOCK = 'chainduel_quickMenuDock_v2';
/**
 * sessionStorage: this tab reloaded after a missing lazy chunk and has not
 * loaded a chunk successfully since. Consecutive failures keep it set so a
 * chunk that is actually gone cannot reload in a loop. A successful load
 * clears it, so a later deploy can reload once.
 */
export const STORAGE_KEY_CHUNK_RELOAD = 'chainduel_chunkReload';
