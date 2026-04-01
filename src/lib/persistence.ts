/**
 * IndexedDB persistence layer for cross-session run history and stats.
 *
 * Wraps the raw IndexedDB API with typed async operations. All functions
 * degrade gracefully when IndexedDB is unavailable (private browsing,
 * restricted contexts) — the game works without persistence.
 *
 * Database schema is versioned via the `DB_VERSION` constant. Bump it
 * and add upgrade logic in `openDB()` for future migrations.
 *
 * NO React imports — this is a pure async utility module.
 */

import type { CompletedRun, LifetimeStats } from "@/types/persistence";
import { EMPTY_LIFETIME_STATS } from "@/types/persistence";

// ---------------------------------------------------------------------------
// Database configuration
// ---------------------------------------------------------------------------

const DB_NAME = "deadbolt-db";
const DB_VERSION = 1;
const STORE_RUNS = "runs";

/** Maximum number of runs to keep in history. */
const MAX_HISTORY = 20;

/** Maximum number of entries in the leaderboard. */
const MAX_LEADERBOARD = 10;

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

/** Cached database connection (singleton per session). */
let dbInstance: IDBDatabase | null = null;

/**
 * Check whether IndexedDB is available in the current environment.
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Open (or create) the IndexedDB database.
 *
 * Returns the cached connection if already open. Creates the object
 * store on first open or version upgrade.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // --- Version 1: Create runs object store ---
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const store = db.createObjectStore(STORE_RUNS, { keyPath: "id" });
        // Index by score (descending) for leaderboard queries
        store.createIndex("by-score", "score", { unique: false });
        // Index by completedAt (descending) for history queries
        store.createIndex("by-date", "completedAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Clear cached connection on unexpected close (e.g. version change)
      dbInstance.onclose = () => { dbInstance = null; };
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn("[Persistence] Failed to open IndexedDB:", request.error);
      reject(request.error);
    };
  });
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Save a completed run to IndexedDB.
 *
 * After saving, prunes old runs beyond MAX_HISTORY (keeps most recent).
 * Silently succeeds if IndexedDB is unavailable.
 */
export async function saveRun(run: CompletedRun): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RUNS, "readwrite");
    const store = tx.objectStore(store_name(tx));

    // Add the new run
    await idbRequest(store.put(run));
    await idbTransaction(tx);

    // Prune old runs beyond MAX_HISTORY
    await pruneOldRuns(db);
  } catch (err) {
    console.warn("[Persistence] Failed to save run:", err);
  }
}

/**
 * Remove runs beyond MAX_HISTORY, keeping the most recent ones.
 */
async function pruneOldRuns(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE_RUNS, "readwrite");
  const store = tx.objectStore(STORE_RUNS);
  const index = store.index("by-date");

  // Count total runs
  const countReq = store.count();
  const count = await idbRequest(countReq) as number;

  if (count <= MAX_HISTORY) return;

  // Open cursor from oldest (ascending by date) and delete extras
  const toDelete = count - MAX_HISTORY;
  let deleted = 0;

  return new Promise<void>((resolve, reject) => {
    const cursor = index.openCursor(null, "next"); // ascending = oldest first
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c && deleted < toDelete) {
        c.delete();
        deleted++;
        c.continue();
      } else {
        resolve();
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/**
 * Clear all stored runs. Use for testing or user-initiated data wipe.
 */
export async function clearAllRuns(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RUNS, "readwrite");
    const store = tx.objectStore(STORE_RUNS);
    await idbRequest(store.clear());
    await idbTransaction(tx);
  } catch (err) {
    console.warn("[Persistence] Failed to clear runs:", err);
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Load the most recent runs (up to MAX_HISTORY), newest first.
 */
export async function loadRunHistory(): Promise<CompletedRun[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RUNS, "readonly");
    const store = tx.objectStore(STORE_RUNS);
    const index = store.index("by-date");

    return new Promise<CompletedRun[]>((resolve, reject) => {
      const runs: CompletedRun[] = [];
      const cursor = index.openCursor(null, "prev"); // descending = newest first

      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c && runs.length < MAX_HISTORY) {
          runs.push(c.value as CompletedRun);
          c.continue();
        } else {
          resolve(runs);
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  } catch (err) {
    console.warn("[Persistence] Failed to load run history:", err);
    return [];
  }
}

/**
 * Get the top runs ranked by score (up to MAX_LEADERBOARD), highest first.
 */
export async function getLeaderboard(): Promise<CompletedRun[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RUNS, "readonly");
    const store = tx.objectStore(STORE_RUNS);
    const index = store.index("by-score");

    return new Promise<CompletedRun[]>((resolve, reject) => {
      const runs: CompletedRun[] = [];
      const cursor = index.openCursor(null, "prev"); // descending = highest first

      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c && runs.length < MAX_LEADERBOARD) {
          runs.push(c.value as CompletedRun);
          c.continue();
        } else {
          resolve(runs);
        }
      };
      cursor.onerror = () => reject(cursor.error);
    });
  } catch (err) {
    console.warn("[Persistence] Failed to load leaderboard:", err);
    return [];
  }
}

/**
 * Compute lifetime stats by aggregating all stored runs.
 */
export async function getLifetimeStats(): Promise<LifetimeStats> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_RUNS, "readonly");
    const store = tx.objectStore(STORE_RUNS);
    const allRuns = await idbRequest(store.getAll()) as CompletedRun[];

    return computeLifetimeFromRuns(allRuns);
  } catch (err) {
    console.warn("[Persistence] Failed to compute lifetime stats:", err);
    return { ...EMPTY_LIFETIME_STATS };
  }
}

/**
 * Pure function to compute lifetime stats from an array of runs.
 * Exported for testing.
 */
export function computeLifetimeFromRuns(runs: CompletedRun[]): LifetimeStats {
  const stats: LifetimeStats = { ...EMPTY_LIFETIME_STATS, killsByType: {} };

  for (const run of runs) {
    stats.totalRuns++;
    stats.totalKills += run.totalKills;
    stats.totalBarricadesBuilt += run.barricadesBuilt;
    stats.totalTimePlayed += run.elapsedTotal;

    if (run.elapsedTotal > stats.longestRunTime) {
      stats.longestRunTime = run.elapsedTotal;
    }
    if (run.dayNumber > stats.highestDay) {
      stats.highestDay = run.dayNumber;
    }
    if (run.score > stats.highestScore) {
      stats.highestScore = run.score;
    }

    // Aggregate kills by type
    for (const [variant, count] of Object.entries(run.killsByType)) {
      const v = variant as keyof typeof run.killsByType;
      stats.killsByType[v] = (stats.killsByType[v] ?? 0) + (count ?? 0);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// IndexedDB promise helpers
// ---------------------------------------------------------------------------

/** Wrap an IDBRequest in a Promise. */
function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Wait for an IDBTransaction to complete. */
function idbTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Helper to get store name (avoids shadowing). */
function store_name(_tx: IDBTransaction): string {
  return STORE_RUNS;
}

// ---------------------------------------------------------------------------
// Testing helpers
// ---------------------------------------------------------------------------

/**
 * Reset the cached database connection. Call in test cleanup.
 * @internal
 */
export function _resetDBConnection(): void {
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
  }
  dbInstance = null;
}
