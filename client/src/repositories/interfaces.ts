import type {
  HistoryEntry,
  Collection,
  SavedRequest,
  EnvironmentsState,
  EnvVariable,
} from './types'

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryRepository {
  load(): Promise<HistoryEntry[]>
  add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry>
  remove(id: string): Promise<void>
  clearAll(): Promise<void>
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface CollectionsRepository {
  load(): Promise<Collection[]>

  createCollection(name: string): Promise<Collection>
  renameCollection(id: string, name: string): Promise<void>
  deleteCollection(id: string): Promise<void>
  duplicateCollection(id: string): Promise<Collection>

  createFolder(collectionId: string, name: string): Promise<Collection>
  renameFolder(collectionId: string, folderId: string, name: string): Promise<void>
  deleteFolder(collectionId: string, folderId: string): Promise<void>

  saveRequest(
    collectionId: string,
    folderId: string | null,
    request: Omit<SavedRequest, 'id'>,
  ): Promise<SavedRequest>
  deleteRequest(collectionId: string, folderId: string | null, requestId: string): Promise<void>
  duplicateRequest(
    collectionId: string,
    folderId: string | null,
    requestId: string,
  ): Promise<SavedRequest>

  importCollection(collection: Collection): Promise<void>
}

// ─── Environments ────────────────────────────────────────────────────────────

export interface EnvironmentsRepository {
  load(): Promise<EnvironmentsState>
  save(state: EnvironmentsState): Promise<void>

  createEnvironment(name: string): Promise<EnvironmentsState>
  renameEnvironment(id: string, name: string): Promise<void>
  deleteEnvironment(id: string): Promise<EnvironmentsState>
  setActiveEnvironment(id: string | null): Promise<void>
  updateVariables(envId: string, variables: EnvVariable[]): Promise<void>
}
