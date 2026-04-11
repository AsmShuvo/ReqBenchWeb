import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HttpMethod, KeyValuePair } from './useRequestStore'

export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValuePair[]
  headers: KeyValuePair[]
  body: string
  authType: 'none' | 'bearer' | 'basic'
  authToken: string
}

export interface CollectionFolder {
  id: string
  name: string
  requests: SavedRequest[]
}

export interface Collection {
  id: string
  name: string
  folders: CollectionFolder[]
  requests: SavedRequest[]
}

interface CollectionStore {
  collections: Collection[]

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
}

export const useCollectionStore = create<CollectionStore>()(
  persist(
    (set, get) => ({
      collections: [],

      createCollection: (name) =>
        set((state) => ({
          collections: [
            ...state.collections,
            { id: crypto.randomUUID(), name, folders: [], requests: [] },
          ],
        })),

      renameCollection: (id, name) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === id ? { ...c, name } : c,
          ),
        })),

      deleteCollection: (id) =>
        set((state) => ({
          collections: state.collections.filter((c) => c.id !== id),
        })),

      duplicateCollection: (id) => {
        const source = get().collections.find((c) => c.id === id)
        if (!source) return
        const deepCopy: Collection = JSON.parse(JSON.stringify(source))
        deepCopy.id = crypto.randomUUID()
        deepCopy.name = `${source.name} (copy)`
        deepCopy.folders.forEach((f) => {
          f.id = crypto.randomUUID()
          f.requests.forEach((r) => (r.id = crypto.randomUUID()))
        })
        deepCopy.requests.forEach((r) => (r.id = crypto.randomUUID()))
        set((state) => ({ collections: [...state.collections, deepCopy] }))
      },

      createFolder: (collectionId, name) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: [
                    ...c.folders,
                    { id: crypto.randomUUID(), name, requests: [] },
                  ],
                }
              : c,
          ),
        })),

      renameFolder: (collectionId, folderId, name) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: c.folders.map((f) =>
                    f.id === folderId ? { ...f, name } : f,
                  ),
                }
              : c,
          ),
        })),

      deleteFolder: (collectionId, folderId) =>
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === collectionId
              ? { ...c, folders: c.folders.filter((f) => f.id !== folderId) }
              : c,
          ),
        })),

      saveRequest: (collectionId, folderId, request) => {
        const saved: SavedRequest = { ...request, id: crypto.randomUUID() }
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            if (folderId) {
              return {
                ...c,
                folders: c.folders.map((f) =>
                  f.id === folderId
                    ? { ...f, requests: [...f.requests, saved] }
                    : f,
                ),
              }
            }
            return { ...c, requests: [...c.requests, saved] }
          }),
        }))
      },

      deleteRequest: (collectionId, folderId, requestId) =>
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
        })),

      duplicateRequest: (collectionId, folderId, requestId) => {
        const col = get().collections.find((c) => c.id === collectionId)
        if (!col) return
        const list = folderId
          ? col.folders.find((f) => f.id === folderId)?.requests
          : col.requests
        const source = list?.find((r) => r.id === requestId)
        if (!source) return
        const copy: SavedRequest = {
          ...JSON.parse(JSON.stringify(source)),
          id: crypto.randomUUID(),
          name: `${source.name} (copy)`,
        }
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== collectionId) return c
            if (folderId) {
              return {
                ...c,
                folders: c.folders.map((f) =>
                  f.id === folderId
                    ? { ...f, requests: [...f.requests, copy] }
                    : f,
                ),
              }
            }
            return { ...c, requests: [...c.requests, copy] }
          }),
        }))
      },
    }),
    { name: 'reqbench-collections' },
  ),
)
