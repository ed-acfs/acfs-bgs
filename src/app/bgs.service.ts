import { Injectable } from '@angular/core';
import { BUILD_ID } from './build-info';
import { ArchitectSubmission, buildArchitectFormBody } from '../core/architect-form';
import { ArchitectInfo, ArchitectRegistryRow, buildArchitectInfoMap } from '../core/architect-registry';
import { BgsDataset, BgsRow, parseArchitectsTsv, rowWithAssignment, toBgsRow } from '../core/bgs';
import {
  ARCHITECT_FORM_ACTION,
  ARCHITECTS_SHEET_URL,
  BGS_DATA_URL,
  STORAGE_PREFIX,
  TYPEAHEAD_URL,
  WATCHLIST_SHEET_URL,
} from '../core/config';
import { logger } from '../core/logger';
import { PriorityWatchlistEntry, buildWatchlistMap, parseWatchlistTsv } from '../core/priority-watchlist';

/**
 * The published sheets ({@link ARCHITECTS_SHEET_URL}, {@link WATCHLIST_SHEET_URL}) are
 * unauthenticated Google infrastructure with no stability contract, so any failure (CORS,
 * network, an unrecognised layout) just means an empty registry or watchlist this session.
 */
const ARCHITECTS_SHEET_TIMEOUT_MS = 8000;
const WATCHLIST_SHEET_TIMEOUT_MS = 8000;

/** Default per-request timeout for remote API calls (ms). */
const HTTP_TIMEOUT_MS = 20000;
/** Number of automatic retries for transient failures. */
const HTTP_RETRY_COUNT = 2;
/** Timeout for a form submission (ms). Not retried — see {@link BgsService.submitAssignment}. */
const FORM_SUBMIT_TIMEOUT_MS = 15000;

/** localStorage key the architect registry is persisted under. */
const ARCHITECTS_CACHE_KEY = `${STORAGE_PREFIX}architects-cache:v2`;
/** How long the architect registry is cached before it's refetched — short, so a new assignment shows up soon. */
const ARCHITECTS_CACHE_DURATION_MS = 15 * 60 * 1000;

/** localStorage key the priority watchlist is persisted under. */
const WATCHLIST_CACHE_KEY = `${STORAGE_PREFIX}watchlist-cache:v1`;
/** How long the priority watchlist is cached before it's refetched. */
const WATCHLIST_CACHE_DURATION_MS = 15 * 60 * 1000;

/**
 * Error thrown by {@link BgsService}'s HTTP helpers for non-2xx responses.
 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Resolves after `ms` milliseconds. Used for retry backoff. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** A typeahead match, with the coordinates needed to sort by distance from it. */
export interface TypeaheadSystem {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface TypeaheadResponse {
  min_max?: TypeaheadSystem[];
  values?: string[];
}

/** The dataset's own timestamps, shown in the page header. */
export interface DatasetInfo {
  /** ISO 8601 time the dataset was downloaded from Spansh. */
  generatedAt: string;
  /** ISO 8601 time of the last BGS tick at that moment; null if unknown. */
  tickAt: string | null;
  count: number;
}

export interface BgsPage {
  page: number;
  rows: BgsRow[];
  totalCount: number;
  totalPages: number;
}

interface ArchitectsCachePayload {
  fetchedAt: number;
  /** The build that wrote this cache; a mismatch (a new build was deployed) invalidates it. */
  buildId: string;
  rows: ArchitectRegistryRow[];
}

interface WatchlistCachePayload {
  fetchedAt: number;
  /** The build that wrote this cache; a mismatch (a new build was deployed) invalidates it. */
  buildId: string;
  entries: PriorityWatchlistEntry[];
}

/**
 * Loads the BGS dataset: a table of systems with their controlling faction, the squadron
 * faction's influence, and (via a separate lookup) architect details.
 *
 * The whole dataset is one static file (see {@link BGS_DATA_URL}), so page 0 holds every
 * system and there are no further pages; the table slices it client-side.
 *
 * Caching:
 * - The dataset is fetched once per session; page 0 is memoised in memory.
 * - The architect registry is fetched once and persisted in localStorage for
 *   {@link ARCHITECTS_CACHE_DURATION_MS}, since it changes far less often than BGS influence.
 */
@Injectable({ providedIn: 'root' })
export class BgsService {
  private datasetPromise?: Promise<BgsDataset>;
  private readonly pagePromises = new Map<number, Promise<BgsPage>>();
  private registryPromise?: Promise<ArchitectRegistryRow[]>;
  /** The resolved registry, once loaded — what {@link recordAssignment} appends to. */
  private registryRows: ArchitectRegistryRow[] | null = null;
  /** When the registry was fetched, preserved across local edits so it still expires on schedule. */
  private registryFetchedAt = 0;
  /** {@link registryRows} collapsed to one entry per system; rebuilt when the registry changes. */
  private architectInfo: Map<string, ArchitectInfo> | null = null;
  private watchlistPromise?: Promise<Map<string, PriorityWatchlistEntry[]>>;

  /** Fetches a page of BGS results (0-based), from cache if it's already been loaded. */
  getPage(page: number): Promise<BgsPage> {
    let promise = this.pagePromises.get(page);
    if (!promise) {
      promise = this.fetchPage(page);
      this.pagePromises.set(page, promise);
      // Don't poison the cache with a failed fetch — let a later call retry.
      promise.catch(() => this.pagePromises.delete(page));
    }
    return promise;
  }

  /** Fire-and-forget prefetch for the next page; failures are silent and just retried on real navigation. */
  prefetchPage(page: number): void {
    void this.getPage(page).catch(() => {});
  }

  /** When the dataset was downloaded from Spansh, and the last tick at that moment — for the page header. */
  async getDatasetInfo(): Promise<DatasetInfo> {
    const dataset = await this.getDataset();
    return { generatedAt: dataset.generated_at, tickAt: dataset.tick_at ?? null, count: dataset.results.length };
  }

  /** Name-suggestion + coordinate lookup, for the "sort by distance from system" search box. */
  typeahead(query: string): Promise<TypeaheadResponse> {
    return this.resilientGet<TypeaheadResponse>(`${TYPEAHEAD_URL}?q=${encodeURIComponent(query)}`);
  }

  /**
   * Every Architect Registry submission, oldest first — the Assign dialog's source for
   * architect-name suggestions and for what a known architect last answered.
   */
  getArchitectRegistry(): Promise<readonly ArchitectRegistryRow[]> {
    return this.getRegistry();
  }

  /** Every Priority Watchlist entry, grouped by system — what {@link toRow} attaches to each {@link BgsRow}. */
  getPriorityWatchlist(): Promise<ReadonlyMap<string, PriorityWatchlistEntry[]>> {
    return this.getWatchlist();
  }

  /**
   * Submits a filled-in Assign dialog to the Architect Registry form.
   *
   * Google Forms sends no CORS headers, so this has to go out as an opaque `no-cors` request:
   * the submission is recorded, but the response is unreadable. A rejection therefore means
   * "the request never left the browser" (offline, blocked, timed out) — which is the failure
   * worth offering a retry for — while a resolve means "accepted by Google as far as we can
   * tell". It's deliberately not retried automatically: a retried POST that actually succeeded
   * the first time would add a duplicate row to the registry.
   */
  async submitAssignment(submission: ArchitectSubmission): Promise<void> {
    if (!ARCHITECT_FORM_ACTION) {
      throw new Error('The Architect Registry form is not configured yet.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FORM_SUBMIT_TIMEOUT_MS);
    try {
      await fetch(ARCHITECT_FORM_ACTION, {
        method: 'POST',
        mode: 'no-cors',
        // A CORS-safelisted content type, so the request needs no preflight (which would fail).
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: buildArchitectFormBody(submission).toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Folds a just-submitted assignment into everything already loaded — the registry, the
   * system lookup derived from it, the memoised BGS pages and the persisted cache — so the
   * new architect shows up straight away, and survives a reload, without waiting for Google
   * to republish the sheet. The cache's original fetch time is kept, so the authoritative
   * data is still refetched on the usual schedule.
   */
  recordAssignment(submission: ArchitectSubmission): void {
    const row: ArchitectRegistryRow = {
      systemName: submission.systemName,
      architect: submission.architect,
      affiliation: submission.affiliation,
      preferredFaction: submission.preferredFaction,
    };

    if (this.registryRows) {
      this.registryRows.push(row);
      this.architectInfo = buildArchitectInfoMap(this.registryRows);
      this.writeArchitectsCache(this.registryRows, this.registryFetchedAt);
    }

    for (const [page, promise] of [...this.pagePromises]) {
      const patched = promise.then(result => ({
        ...result,
        rows: result.rows.map(r => (r.systemName === submission.systemName ? rowWithAssignment(r, submission) : r)),
      }));
      patched.catch(() => this.pagePromises.delete(page));
      this.pagePromises.set(page, patched);
    }
  }

  /**
   * Every row of the BGS dataset, in its natural order (most recently updated first). Used
   * when the table switches into a full-dataset sort (by distance or by influence). The
   * dataset is a single file, so `onProgress` only ever reports 0 of 1, then 1 of 1.
   */
  async getAllRows(onProgress?: (loaded: number, total: number) => void): Promise<BgsRow[]> {
    onProgress?.(0, 1);
    const { rows } = await this.getPage(0);
    onProgress?.(1, 1);
    return rows;
  }

  private async fetchPage(page: number): Promise<BgsPage> {
    const [dataset, architects, watchlist] = await Promise.all([this.getDataset(), this.getArchitectInfo(), this.getWatchlist()]);
    return {
      page,
      rows: page === 0 ? dataset.results.map(record => toBgsRow(record, architects, watchlist)) : [],
      totalCount: dataset.results.length,
      totalPages: 1,
    };
  }

  /** Loads the dataset at most once per session; a failure clears the memo so a later call can retry. */
  private getDataset(): Promise<BgsDataset> {
    if (!this.datasetPromise) {
      this.datasetPromise = this.resilientGet<BgsDataset>(BGS_DATA_URL).catch(error => {
        this.datasetPromise = undefined;
        throw error;
      });
    }
    return this.datasetPromise;
  }

  /** The system -> architect lookup the table's rows are built from, derived from the registry once. */
  private async getArchitectInfo(): Promise<ReadonlyMap<string, ArchitectInfo>> {
    const rows = await this.getRegistry();
    if (!this.architectInfo) {
      this.architectInfo = buildArchitectInfoMap(rows);
    }
    return this.architectInfo;
  }

  /** Loads the architect registry at most once per session (see class doc). */
  private getRegistry(): Promise<ArchitectRegistryRow[]> {
    if (!this.registryPromise) {
      this.registryPromise = this.loadRegistry().catch(error => {
        // Clear the memo so a later page fetch can retry instead of failing forever.
        this.registryPromise = undefined;
        throw error;
      });
    }
    return this.registryPromise;
  }

  private async loadRegistry(): Promise<ArchitectRegistryRow[]> {
    const cached = this.readArchitectsCache();
    if (cached) {
      this.registryRows = cached.rows;
      this.registryFetchedAt = cached.fetchedAt;
      return cached.rows;
    }

    const rows = await this.loadRegistryFromSheet();
    this.registryRows = rows ?? [];
    this.registryFetchedAt = Date.now();
    // Only a successful fetch is persisted, so a transient failure is retried on the next visit.
    if (rows !== null) {
      this.writeArchitectsCache(rows, this.registryFetchedAt);
    }
    return this.registryRows;
  }

  /**
   * Fetches the published Google Sheet and parses it. Returns null — never throws — when no
   * sheet is configured or the fetch fails, which the caller treats as an empty registry.
   */
  private async loadRegistryFromSheet(): Promise<ArchitectRegistryRow[] | null> {
    if (!ARCHITECTS_SHEET_URL) {
      return null;
    }
    try {
      const text = await this.fetchTextOnce(ARCHITECTS_SHEET_URL, ARCHITECTS_SHEET_TIMEOUT_MS);
      return parseArchitectsTsv(text);
    } catch (error) {
      logger.warn('Architects sheet fetch failed; no architects will be shown this session.', error);
      return null;
    }
  }

  /** Loads the priority watchlist at most once per session, grouped by system; never throws — see {@link loadWatchlist}. */
  private getWatchlist(): Promise<Map<string, PriorityWatchlistEntry[]>> {
    if (!this.watchlistPromise) {
      this.watchlistPromise = this.loadWatchlist();
    }
    return this.watchlistPromise;
  }

  private async loadWatchlist(): Promise<Map<string, PriorityWatchlistEntry[]>> {
    const cached = this.readWatchlistCache();
    if (cached) {
      return buildWatchlistMap(cached.entries);
    }

    const entries = await this.loadWatchlistFromSheet();
    this.writeWatchlistCache(entries, Date.now());
    return buildWatchlistMap(entries);
  }

  /**
   * Fetches the published Priority Watchlist sheet directly. Unlike the Architect Registry
   * there's no Cloud Function fallback for this tab, so any failure just means no watchlist
   * entries are applied this session rather than blocking the page from loading at all.
   */
  private async loadWatchlistFromSheet(): Promise<PriorityWatchlistEntry[]> {
    if (!WATCHLIST_SHEET_URL) {
      return [];
    }
    try {
      const text = await this.fetchTextOnce(WATCHLIST_SHEET_URL, WATCHLIST_SHEET_TIMEOUT_MS);
      return parseWatchlistTsv(text);
    } catch (error) {
      logger.warn('Priority watchlist sheet fetch failed; no watchlist entries will be applied.', error);
      return [];
    }
  }

  private readWatchlistCache(): { entries: PriorityWatchlistEntry[]; fetchedAt: number } | null {
    try {
      const raw = localStorage.getItem(WATCHLIST_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw) as WatchlistCachePayload;
      if (payload.buildId !== BUILD_ID) {
        return null;
      }
      if (Date.now() - payload.fetchedAt >= WATCHLIST_CACHE_DURATION_MS) {
        return null;
      }
      return { entries: payload.entries, fetchedAt: payload.fetchedAt };
    } catch {
      return null;
    }
  }

  private writeWatchlistCache(entries: readonly PriorityWatchlistEntry[], fetchedAt: number): void {
    try {
      const payload: WatchlistCachePayload = { fetchedAt, buildId: BUILD_ID, entries: [...entries] };
      localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the in-memory entries still serve this session.
    }
  }

  private readArchitectsCache(): { rows: ArchitectRegistryRow[]; fetchedAt: number } | null {
    try {
      const raw = localStorage.getItem(ARCHITECTS_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw) as ArchitectsCachePayload;
      // A new build was deployed since this was cached — treat it as stale regardless of age,
      // so a fix or data-shape change ships to every visitor immediately, not after 2 hours.
      if (payload.buildId !== BUILD_ID) {
        return null;
      }
      if (Date.now() - payload.fetchedAt >= ARCHITECTS_CACHE_DURATION_MS) {
        return null;
      }
      return { rows: payload.rows, fetchedAt: payload.fetchedAt };
    } catch {
      return null;
    }
  }

  private writeArchitectsCache(rows: readonly ArchitectRegistryRow[], fetchedAt: number): void {
    try {
      const payload: ArchitectsCachePayload = { fetchedAt, buildId: BUILD_ID, rows: [...rows] };
      localStorage.setItem(ARCHITECTS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the in-memory rows still serve this session.
    }
  }

  /**
   * Performs an HTTP GET with a timeout and exponential-backoff retry so that
   * transient network errors and slow/hung requests don't permanently break
   * the feature. Callers still receive the error if all retries fail.
   */
  private async resilientGet<T>(url: string, timeoutMs: number = HTTP_TIMEOUT_MS): Promise<T> {
    let lastError: unknown;
    // One initial attempt plus HTTP_RETRY_COUNT retries.
    for (let attempt = 0; attempt <= HTTP_RETRY_COUNT; attempt++) {
      try {
        return await this.fetchJson<T>(url, timeoutMs);
      } catch (error) {
        lastError = error;
        // Don't retry client errors — they won't succeed on a retry. Timeouts (aborts)
        // and network/5xx errors are still retried with backoff.
        const status = error instanceof HttpError ? error.status : undefined;
        if (status !== undefined && status >= 400 && status < 500) {
          throw error;
        }
        if (attempt === HTTP_RETRY_COUNT) {
          break;
        }
        const retryIndex = attempt + 1;
        await delay(Math.min(1000 * 2 ** (retryIndex - 1), 8000));
      }
    }
    throw lastError;
  }

  private async fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
    return JSON.parse(await this.fetchTextOnce(url, timeoutMs)) as T;
  }

  /** A single fetch attempt (no retry) with a timeout; throws on any non-2xx or network failure. */
  private async fetchTextOnce(url: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new HttpError(response.status, response.statusText || `HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }
}
