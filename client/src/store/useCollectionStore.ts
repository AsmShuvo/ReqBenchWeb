import { create } from 'zustand'
import { collectionsRepo } from '../repositories'
import type { Collection, SavedRequest } from '../repositories/types'

// Re-export types for backward compatibility with component imports
export type {
  Collection,
  CollectionFolder,
  SavedRequest,
} from '../repositories/types'

interface CollectionStore {
  collections: Collection[]
  _loaded: boolean
  _load: () => Promise<void>

  createCollection: (name: string) => void
  renameCollection: (id: string, name: string) => void
  deleteCollection: (id: string) => void
  duplicateCollection: (id: string) => void

  createFolder: (collectionId: string, name: string) => void
  renameFolder: (collectionId: string, folderId: string, name: string) => void
  deleteFolder: (collectionId: string, folderId: string) => void

  saveRequest: (
    collectionId: string,
    folderId: string | null,
    request: Omit<SavedRequest, 'id'>,
  ) => void
  deleteRequest: (collectionId: string, folderId: string | null, requestId: string) => void
  duplicateRequest: (collectionId: string, folderId: string | null, requestId: string) => void

  importCollection: (collection: Collection) => void
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  collections: [],
  _loaded: false,

  _load: async () => {
    if (get()._loaded) return
    const collections = await collectionsRepo.load()
    set({ collections, _loaded: true })
  },

  createCollection: (name) => {
    collectionsRepo.createCollection(name).then((col) => {
      set((state) => ({ collections: [...state.collections, col] }))
    })
  },

  renameCollection: (id, name) => {
    set((state) => ({
      collections: state.collections.map((c) => (c.id === id ? { ...c, name } : c)),
    }))
    collectionsRepo.renameCollection(id, name)
  },

  deleteCollection: (id) => {
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    }))
    collectionsRepo.deleteCollection(id)
  },

  duplicateCollection: (id) => {
    collectionsRepo.duplicateCollection(id).then((copy) => {
      set((state) => ({ collections: [...state.collections, copy] }))
    })
  },

  createFolder: (collectionId, name) => {
    collectionsRepo.createFolder(collectionId, name).then((updated) => {
      set((state) => ({
        collections: state.collections.map((c) => (c.id === collectionId ? updated : c)),
      }))
    })
  },

  renameFolder: (collectionId, folderId, name) => {
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, folders: c.folders.map((f) => (f.id === folderId ? { ...f, name } : f)) }
          : c,
      ),
    }))
    collectionsRepo.renameFolder(collectionId, folderId, name)
  },

  deleteFolder: (collectionId, folderId) => {
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, folders: c.folders.filter((f) => f.id !== folderId) }
          : c,
      ),
    }))
    collectionsRepo.deleteFolder(collectionId, folderId)
  },

  saveRequest: (collectionId, folderId, request) => {
    collectionsRepo.saveRequest(collectionId, folderId, request).then((saved) => {
      set((state) => ({
        collections: state.collections.map((c) => {
          if (c.id !== collectionId) return c
          if (folderId) {
            return {
              ...c,
              folders: c.folders.map((f) =>
                f.id === folderId ? { ...f, requests: [...f.requests, saved] } : f,
              ),
            }
          }
          return { ...c, requests: [...c.requests, saved] }
        }),
      }))
    })
  },

  deleteRequest: (collectionId, folderId, requestId) => {
    set((state) => ({
      collections: state.collections.map((c) => {
        if (c.id !== collectionId) return c
        if (folderId) {
          return {
            ...c,
            folders: c.folders.map((f) =>
              f.id === folderId
                ? { ...f, requests: f.requests.filter((r) => r.id !== requestId) }
                : f,
            ),
          }
        }
        return { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
      }),
    }))
    collectionsRepo.deleteRequest(collectionId, folderId, requestId)
  },

  importCollection: (collection) => {
    // Persist and add to state
    collectionsRepo.importCollection(collection).then(() => {
      set((state) => ({ collections: [...state.collections, collection] }))
    })
  },

  duplicateRequest: (collectionId, folderId, requestId) => {
    collectionsRepo.duplicateRequest(collectionId, folderId, requestId).then((copy) => {
      set((state) => ({
        collections: state.collections.map((c) => {
          if (c.id !== collectionId) return c
          if (folderId) {
            return {
              ...c,
              folders: c.folders.map((f) =>
                f.id === folderId ? { ...f, requests: [...f.requests, copy] } : f,
              ),
            }
          }
          return { ...c, requests: [...c.requests, copy] }
        }),
      }))
    })
  },
}))

// Eagerly load on module init
useCollectionStore.getState()._load()
