/**
 * Everything specific to the squadron, in one place. The values live in `config.json` so the
 * Node scripts (`scripts/fetch-bgs.mjs`) read the same faction name the app does; this module
 * just gives them names and types.
 */
import config from './config.json';

/** The squadron the tool is for. */
export const SQUADRON_NAME: string = config.squadron;

/** The squadron's short tag, as used in the Ordini Ufficiali report ("Election per ACFS > …"). */
export const SQUADRON_TAG: string = config.squadronTag;

/** The squadron's minor faction (PMF): the one the dataset is downloaded for and the table is about. */
export const FACTION_NAME: string = config.faction;

/** The faction's home system: the default distance reference, and where it can never retreat from. */
export const HOME_SYSTEM: string = config.homeSystem;

/** An optional second faction (ally or rival) to show alongside ours, for comparison only. Null for none. */
export const COMPARE_FACTION: string | null = config.compareFaction;

/**
 * Within this many percentage points of the controlling faction (our lead where we control, our
 * gap elsewhere), a conflict for control is possible.
 */
export const CONFLICT_MARGIN_POINTS: number = config.conflictMarginPoints;

/** At or below this influence (percent) at the tick, a faction enters Retreat. */
export const RETREAT_INFLUENCE_PERCENT: number = config.retreatInfluencePercent;

/** Lower bounds of a traffic light: at or above `green` it's green, at or above `yellow` yellow, red below. */
export interface SemaphoreThreshold {
  green: number;
  yellow: number;
}

/**
 * The squadron's two traffic lights for a controlled system (see `semaphore.ts`): influence in
 * percent and the lead over the second faction in points.
 */
export const SEMAPHORE_THRESHOLDS: { influence: SemaphoreThreshold; margin: SemaphoreThreshold } = config.semaphores;

/**
 * How the priority treats a system the Architect Registry says nothing about: "in-scope"
 * counts it as ours (defend it and push for control), "assumed" only defends it until
 * someone registers it (Canonn's policy).
 */
export const UNREGISTERED_SCOPE: 'in-scope' | 'assumed' = config.unregisteredScope === 'assumed' ? 'assumed' : 'in-scope';

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

/**
 * The web app URL of the password-protected Apps Script (`apps-script/assegna.gs`) that
 * records assignments in the registry. Once set, Assign asks for the officers' password and
 * writes through it instead of the Form; while null, Assign keeps using the Form.
 */
export const ASSIGN_SCRIPT_URL: string | null = config.assignScriptUrl || null;

/**
 * SHA-256 hex digest of the Ordini Ufficiali page's shared passphrase. This is a deterrent,
 * not real access control — it's a public static site, so anyone can read this hash out of
 * the published bundle and brute-force a weak passphrase offline. Good enough to keep casual
 * visitors out until phase 8 (Cloudflare Access) lands. The placeholder passphrase is
 * "cambiami" ("change me") — replace this hash before sharing the link.
 */
export const ORDERS_PASSPHRASE_HASH: string = config.ordersPassphraseHash;
