/**
 * Everything specific to the squadron, in one place. The values live in `config.json` so the
 * Node scripts (`scripts/fetch-bgs.mjs`) read the same faction name the app does; this module
 * just gives them names and types.
 */
import config from './config.json';

/** The squadron the tool is for. */
export const SQUADRON_NAME: string = config.squadron;

/** The squadron's minor faction (PMF): the one the dataset is downloaded for and the table is about. */
export const FACTION_NAME: string = config.faction;

/** The faction's home system: the default distance reference, and where it can never retreat from. */
export const HOME_SYSTEM: string = config.homeSystem;

/** An optional second faction (ally or rival) to show alongside ours, for comparison only. Null for none. */
export const COMPARE_FACTION: string | null = config.compareFaction;

/** Below this lead over the next faction (in percentage points), a controlled system is at risk of a conflict. */
export const CONFLICT_MARGIN_POINTS: number = config.conflictMarginPoints;

/** Prefix for every localStorage key, so the tool's entries don't collide with another app's on the same origin. */
export const STORAGE_PREFIX: string = config.storagePrefix;

/** The static dataset `scripts/fetch-bgs.mjs` writes. Relative, so it resolves under any base href. */
export const BGS_DATA_URL: string = config.dataUrl;

/**
 * Galaxy-wide system name and coordinate lookup, for the "sort by distance" search box:
 * Canonn's public proxy of Spansh's own typeahead, which sends no CORS headers itself.
 */
export const TYPEAHEAD_URL: string = config.typeaheadUrl;

/** The Architect Registry's Google Form response sheet, published as TSV. Null until the squadron's own sheet exists. */
export const ARCHITECTS_SHEET_URL: string | null = config.architectsSheetUrl;

/** The Priority Watchlist tab of the same spreadsheet, published as TSV. Null until it exists. */
export const WATCHLIST_SHEET_URL: string | null = config.watchlistSheetUrl;

/**
 * Where the Architect Registry form is submitted: the `viewform` URL with the last segment
 * swapped for `formResponse`. Null until the squadron's own form exists, and Assign refuses
 * to submit until then.
 */
export const ARCHITECT_FORM_ACTION: string | null = config.architectFormAction;
