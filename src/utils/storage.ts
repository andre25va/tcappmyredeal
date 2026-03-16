import { Deal, DirectoryContact, MlsEntry, ComplianceTemplate, AppUser } from '../types';

// Extend Window to include optional Tasklet bridge
declare global {
  interface Window {
    tasklet?: {
      readFileFromDisk: (path: string) => Promise<string | null>;
      writeFileToDisk: (path: string, content: string) => Promise<void>;
    };
  }
}

const STORAGE_VERSION = 1;

type PersistedEnvelope<T> = {
  version: number;
  data: T;
};

type Migrator<T> = (input: unknown) => T;

const hasTaskletStorage = () => (
  typeof window !== 'undefined' &&
  typeof window.tasklet?.readFileFromDisk === 'function' &&
  typeof window.tasklet?.writeFileToDisk === 'function'
);

const localStorageKey = (path: string) => `tc-dashboard:${path}`;

function unwrapEnvelope<T>(raw: string): unknown {
  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    'version' in parsed &&
    'data' in parsed
  ) {
    return (parsed as PersistedEnvelope<T>).data;
  }
  return parsed;
}

export async function readPersistedData<T>(path: string, migrate: Migrator<T>): Promise<T> {
  let raw: string | null = null;

  if (hasTaskletStorage()) {
    raw = await window.tasklet!.readFileFromDisk(path);
  } else {
    const stored = window.localStorage.getItem(localStorageKey(path));
    if (stored == null) {
      throw new Error(`Missing local storage entry for ${path}`);
    }
    raw = stored;
  }

  if (raw == null) throw new Error(`No data at ${path}`);
  return migrate(unwrapEnvelope<T>(raw));
}

export async function writePersistedData<T>(path: string, data: T): Promise<void> {
  const payload = JSON.stringify({ version: STORAGE_VERSION, data } satisfies PersistedEnvelope<T>);

  if (hasTaskletStorage()) {
    await window.tasklet!.writeFileToDisk(path, payload);
    return;
  }

  window.localStorage.setItem(localStorageKey(path), payload);
}

function ensureArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

export function migrateDeals(input: unknown): Deal[] {
  return ensureArray(input).map((raw) => {
    const deal = {
      ...(raw as Deal),
      transactionSide: (raw as Partial<Deal>).transactionSide ?? 'buyer',
    };
    // Migrate milestone
    if (!deal.milestone) {
      const statusToMilestone: Record<string, string> = {
        'contract': 'contract-received',
        'due-diligence': 'inspections-due',
        'clear-to-close': 'clear-to-close',
        'closed': 'closed',
        'terminated': 'archived',
      };
      (deal as any).milestone = statusToMilestone[deal.status] ?? 'contract-received';
    }
    // Migrate tasks
    if (!deal.tasks) {
      (deal as any).tasks = [];
    }
    return deal;
  });
}

export function migrateDirectory(input: unknown): DirectoryContact[] {
  return ensureArray(input) as DirectoryContact[];
}

export function migrateMls(input: unknown): MlsEntry[] {
  return ensureArray(input).map((entry) => {
    const typedEntry = entry as MlsEntry;
    return {
      ...typedEntry,
      documents: Array.isArray((entry as Partial<MlsEntry>).documents)
        ? typedEntry.documents
        : [],
    };
  });
}

export function migrateCompliance(input: unknown): ComplianceTemplate[] {
  return ensureArray(input) as ComplianceTemplate[];
}

export function migrateUsers(input: unknown): AppUser[] {
  return ensureArray(input) as AppUser[];
}
