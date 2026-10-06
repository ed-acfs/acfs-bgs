/**
 * The squadron's Architect Registry Google Form: its field ids, its accepted answers, and the
 * request body a submission turns into.
 *
 * The ids and option strings below are the form's own (read out of the live form's
 * `FB_PUBLIC_LOAD_DATA_`), so they have to match exactly — Google silently records a blank
 * answer for an entry id it doesn't recognise, and rejects an unlisted value for a
 * multiple-choice question that has no "other" option.
 */
import { FACTION_NAME } from './config';


// Where the form is submitted is `ARCHITECT_FORM_ACTION` in `config.ts`; these ids belong to
// that form ("ACFS Architect Registry").

const ENTRY_YOUR_NAME = 'entry.1150665299';
const ENTRY_SYSTEM_NAME = 'entry.2086138170';
const ENTRY_ARCHITECT_NAME = 'entry.983657745';
const ENTRY_AFFILIATION = 'entry.1126584006';
const ENTRY_PREFERRED_FACTION = 'entry.55921704';

/** The "ACFS Architect" question's four answers, exactly as the form spells them. */
export const AFFILIATION_SQUADRON_MEMBER = 'The Architect is an ACFS Member';
export const AFFILIATION_NOT_MEMBER = 'Not an ACFS Member';
export const AFFILIATION_NOT_A_COLONY = 'Nobody The System Is Not a Colony';
export const AFFILIATION_UNKNOWN = "Don't know";

/** The affiliation dropdown's contents: the form's value, plus a friendlier label to show. */
export const AFFILIATION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: AFFILIATION_SQUADRON_MEMBER, label: "L'architetto è un membro ACFS" },
  { value: AFFILIATION_NOT_MEMBER, label: 'Non è un membro ACFS' },
  { value: AFFILIATION_NOT_A_COLONY, label: 'Nessuno: il sistema non è una colonia' },
  { value: AFFILIATION_UNKNOWN, label: 'Non so' },
];

/**
 * The only two "Preferred Faction" answers the form lists; anything else (a local faction
 * the colony prefers) has to be sent through the question's "other" option instead.
 */
const LISTED_PREFERRED_FACTIONS: ReadonlySet<string> = new Set([FACTION_NAME]);

/** Google's sentinel value for "the answer is in the `.other_option_response` field". */
const OTHER_OPTION = '__other_option__';

/** One filled-in Architect Registry form, ready to submit. */
export interface ArchitectSubmission {
  /** The commander doing the reporting ("Your Name"). */
  yourName: string;
  systemName: string;
  architect: string;
  /** One of the `AFFILIATION_*` values. */
  affiliation: string;
  /** The faction name, or '' for "Don't know" — the question is optional, so '' is sent as no answer. */
  preferredFaction: string;
}

/**
 * Encodes a submission as the form's POST body. "Don't know" for the preferred faction is
 * sent as no answer at all (the question is optional) rather than as an empty string, which
 * would land in the sheet as a blank the registry can't distinguish from a skipped answer.
 */
export function buildArchitectFormBody(submission: ArchitectSubmission): URLSearchParams {
  const body = new URLSearchParams();
  body.set(ENTRY_YOUR_NAME, submission.yourName);
  body.set(ENTRY_SYSTEM_NAME, submission.systemName);
  body.set(ENTRY_ARCHITECT_NAME, submission.architect);
  body.set(ENTRY_AFFILIATION, submission.affiliation);

  const faction = submission.preferredFaction;
  if (faction) {
    if (LISTED_PREFERRED_FACTIONS.has(faction)) {
      body.set(ENTRY_PREFERRED_FACTION, faction);
    } else {
      body.set(ENTRY_PREFERRED_FACTION, OTHER_OPTION);
      body.set(`${ENTRY_PREFERRED_FACTION}.other_option_response`, faction);
    }
  }

  // Single-page form: tell Google this is the whole response so it's recorded rather than
  // treated as a partially-completed page.
  body.set('fvv', '1');
  body.set('pageHistory', '0');
  return body;
}

/**
 * The request body for the password-protected Apps Script (`apps-script/assegna.gs`): the
 * same fields as the Form, as JSON. "Don't know" for the preferred faction is '' there too.
 */
export function buildAssignScriptBody(submission: ArchitectSubmission, password: string): string {
  return JSON.stringify({ password, ...submission });
}

/** Why the Apps Script refused an assignment — the `error` field of its reply. */
export type AssignRejection = 'bad-request' | 'locked' | 'not-configured' | 'password' | 'invalid' | 'unknown';

/** An assignment the Apps Script answered but refused; nothing was written. */
export class AssignRejectedError extends Error {
  constructor(
    public readonly reason: AssignRejection,
    public readonly detail: string | null = null,
  ) {
    super(`Assignment refused: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'AssignRejectedError';
  }
}

const KNOWN_REJECTIONS: ReadonlySet<string> = new Set(['bad-request', 'locked', 'not-configured', 'password', 'invalid']);

/**
 * Reads the Apps Script's reply: returns when the row was written, throws
 * {@link AssignRejectedError} otherwise — including for a reply it doesn't recognise, since
 * only an explicit `ok: true` means the registry has the row.
 */
export function checkAssignScriptReply(reply: unknown): void {
  const body = (reply ?? {}) as { ok?: unknown; error?: unknown; detail?: unknown };
  if (body.ok === true) {
    return;
  }
  const reason = typeof body.error === 'string' && KNOWN_REJECTIONS.has(body.error) ? (body.error as AssignRejection) : 'unknown';
  throw new AssignRejectedError(reason, typeof body.detail === 'string' ? body.detail : null);
}
