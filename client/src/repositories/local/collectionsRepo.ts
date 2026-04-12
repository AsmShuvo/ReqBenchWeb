import type { CollectionsRepository } from '../interfaces'
import type { Collection, SavedRequest } from '../types'

const STORAGE_KEY = 'reqbench-collections'

function readCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed.state?.collections ?? parsed.collections ?? []
  } catch {
    return []
  }
}

function writeCollections(collections: Collection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ collections }))
}

export class LocalCollectionsRepository implements CollectionsRepository {
  async load(): Promise<Collection[]> {
    return readCollections()
  }

  async createCollection(name: string): Promise<Collection> {
    const collections = readCollections()
    const col: Collection = {
      id: crypto.randomUUID(),
      name,
      folders: [],
      requests: [],
    }
    writeCollections([...collections, col])
    return col
  }

  async renameCollection(id: string, name: string): Promise<void> {
    const collections = readCollections()
    writeCollections(collections.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  async deleteCollection(id: string): Promise<void> {
    const collections = readCollections()
    writeCollections(collections.filter((c) => c.id !== id))
  }

  async duplicateCollection(id: string): Promise<Collection> {
    const collections = readCollections()
    const source = collections.find((c) => c.id === id)
    if (!source) throw new Error('Collection not found')

    const deepCopy: Collection = JSON.parse(JSON.stringify(source))
    deepCopy.id = crypto.randomUUID()
    deepCopy.name = `${source.name} (copy)`
    deepCopy.folders.forEach((f) => {
      f.id = crypto.randomUUID()
      f.requests.forEach((r) => (r.id = crypto.randomUUID()))
    })
    deepCopy.requests.forEach((r) => (r.id = crypto.randomUUID()))

    writeCollections([...collections, deepCopy])
    return deepCopy
  }

  async createFolder(collectionId: string, name: string): Promise<Collection> {
    const collections = readCollections()
    const folder = { id: crypto.randomUUID(), name, requests: [] }
    const updated = collections.map((c) =>
      c.id === collectionId ? { ...c, folders: [...c.folders, folder] } : c,
    )
    writeCollections(updated)
    return updated.find((c) => c.id === collectionId)!
  }

  async renameFolder(collectionId: string, folderId: string, name: string): Promise<void> {
    const collections = readCollections()
    writeCollections(
      collections.map((c) =>
        c.id === collectionId
          ? { ...c, folders: c.folders.map((f) => (f.id === folderId ? { ...f, name } : f)) }
          : c,
      ),
    )
  }

  async deleteFolder(collectionId: string, folderId: string): Promise<void> {
    const collections = readCollections()
    writeCollections(
      collections.map((c) =>
        c.id === collectionId
          ? { ...c, folders: c.folders.filter((f) => f.id !== folderId) }
          : c,
      ),
    )
  }

  async saveRequest(
    collectionId: string,
    folderId: string | null,
    request: Omit<SavedRequest, 'id'>,
  ): Promise<SavedRequest> {
    const collections = readCollections()
    const saved: SavedRequest = { ...request, id: crypto.randomUUID() }
    writeCollections(
      collections.map((c) => {
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
    )
    return saved
  }

  async deleteRequest(
    collectionId: string,
    folderId: string | null,
    requestId: string,
  ): Promise<void> {
    const collections = readCollections()
    writeCollections(
      collections.map((c) => {
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
    )
  }

  async duplicateRequest(
    collectionId: string,
    folderId: string | null,
    requestId: string,
  ): Promise<SavedRequest> {
    const collections = readCollections()
    const col = collections.find((c) => c.id === collectionId)
    if (!col) throw new Error('Collection not found')

    const list = folderId
      ? col.folders.find((f) => f.id === folderId)?.requests
      : col.requests
    const source = list?.find((r) => r.id === requestId)
    if (!source) throw new Error('Request not found')

    const copy: SavedRequest = {
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
    }

    writeCollections(
      collections.map((c) => {
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
    )
    return copy
  }

  async importCollection(collection: Collection): Promise<void> {
    const collections = readCollections()
    writeCollections([...collections, collection])
  }
}
