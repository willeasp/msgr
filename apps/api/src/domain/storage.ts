/** What people put in the database, by kind. Text is every message's words. */
export type ContentKind = 'text' | 'picture' | 'movie' | 'sound' | 'avatar';

/** How many there are of one kind of content, and the bytes they're stored in. */
export interface StoredContent {
  readonly kind: ContentKind;
  readonly count: number;
  readonly bytes: number;
}

/** A table and everything it takes up: rows, indexes and TOAST. */
export interface TableSize {
  readonly name: string;
  readonly bytes: number;
}

/** The database as Postgres measures it. */
export interface StorageUsage {
  /** The whole database on disk. */
  readonly databaseBytes: number;
  readonly tables: readonly TableSize[];
  readonly contents: readonly StoredContent[];
}

/** What the admin page shows: the usage, and how much of the plan is left. */
export interface StorageReport extends StorageUsage {
  /** The plan's allowance (`STORAGE_LIMIT_MB`); null when none is set. */
  readonly limitBytes: number | null;
  /** What's left of the allowance, never below nothing; null without one. */
  readonly freeBytes: number | null;
}

const biggestFirst = <T extends { readonly bytes: number }>(
  sizes: readonly T[]
) => [...sizes].sort((a, b) => b.bytes - a.bytes);

/** The usage against the allowance, its tables and contents biggest first. */
export function storageReport(
  usage: StorageUsage,
  limitBytes: number | null
): StorageReport {
  return {
    databaseBytes: usage.databaseBytes,
    limitBytes,
    freeBytes:
      limitBytes === null
        ? null
        : Math.max(0, limitBytes - usage.databaseBytes),
    tables: biggestFirst(usage.tables),
    contents: biggestFirst(usage.contents),
  };
}
