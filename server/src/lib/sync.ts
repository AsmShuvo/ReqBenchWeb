import { prisma } from './prisma'
import type { Prisma } from '../generated/prisma/client'

export interface KeyValuePair { key: string; value: string; enabled: boolean }

export interface SavedRequest {
  id: string
  name: string
  method: string
  url: string
  headers: KeyValuePair[]
  body: string
}

export interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
}

export interface SyncSnapshot {
  collections: Collection[]
}

export async function readSnapshot(userId: string): Promise<SyncSnapshot> {
  const collections = await prisma.collection.findMany({
    where: { userId },
    include: { requests: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      requests: c.requests.map((r) => ({
        id: r.id,
        name: r.name,
        method: r.method,
        url: r.url,
        headers: (Array.isArray(r.headers) ? r.headers : []) as unknown as KeyValuePair[],
        body: r.body,
      })),
    })),
  }
}

// Simple replace-all strategy: delete everything for this user, re-insert from snapshot.
// Wrapped in a transaction so partial writes can't corrupt state.
export async function writeSnapshot(userId: string, snap: SyncSnapshot): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.collection.deleteMany({ where: { userId } })

    for (const c of snap.collections) {
      await tx.collection.create({
        data: {
          id: c.id,
          userId,
          name: c.name,
          requests: {
            create: c.requests.map((r) => ({
              id: r.id,
              name: r.name,
              method: r.method,
              url: r.url,
              headers: r.headers as unknown as Prisma.InputJsonValue,
              body: r.body,
            })),
          },
        },
      })
    }
  })
}
