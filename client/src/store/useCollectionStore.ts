import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HttpMethod, KeyValuePair } from './useRequestStore'

export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: string
}

export interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
}

interface CollectionState {
  collections: Collection[]

  setCollections: (cs: Collection[]) => void
  createCollection: (name: string) => void
  deleteCollection: (id: string) => void
  saveRequest: (collectionId: string, req: Omit<SavedRequest, 'id'>) => void
  deleteRequest: (collectionId: string, requestId: string) => void
}

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set) => ({
      collections: [],

      setCollections: (collections) => set({ collections }),

      createCollection: (name) =>
        set((s) => ({
          collections: [...s.collections, { id: crypto.randomUUID(), name, requests: [] }],
        })),

      deleteCollection: (id) =>
        set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),

      saveRequest: (collectionId, req) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: [...c.requests, { ...req, id: crypto.randomUUID() }] }
              : c,
          ),
        })),

      deleteRequest: (collectionId, requestId) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
              : c,
          ),
        })),
    }),
    { name: 'reqbench-collections' },
  ),
)
