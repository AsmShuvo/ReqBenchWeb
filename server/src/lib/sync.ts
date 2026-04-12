import { prisma } from './prisma'
import type { Prisma } from '../generated/prisma/client'

// ─── Shapes shared with the client ─────────────────────────────────────────
// These mirror client/src/repositories/types.ts so the wire format is stable.

export interface KeyValuePair { key: string; value: string; enabled: boolean }

export interface SavedRequest {
  id: string
  name: string
  method: string
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

export interface HistoryEntry {
  id: string
  method: string
  url: string
  status: number | null
  responseTime: number | null
  timestamp: number
}

export interface EnvVariable {
  key: string
  value: string
  secret: boolean
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
}

export interface SyncSnapshot {
  collections: Collection[]
  history: HistoryEntry[]
  environments: Environment[]
  activeEnvironmentId: string | null
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function readSnapshot(userId: string): Promise<SyncSnapshot> {
  const [collections, history, envs] = await Promise.all([
    prisma.collection.findMany({
      where: { userId },
      include: { folders: { include: { requests: true } }, requests: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.requestHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.environment.findMany({
      where: { userId },
      include: { variables: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      folders: c.folders
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => ({
          id: f.id,
          name: f.name,
          requests: f.requests
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(dbRequestToWire),
        })),
      requests: c.requests
        .filter((r) => r.folderId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(dbRequestToWire),
    })),
    history: history.map((h) => ({
      id: h.id,
      method: h.method,
      url: h.url,
      status: h.status,
      responseTime: h.responseTime,
      timestamp: h.createdAt.getTime(),
    })),
    environments: envs.map((e) => ({
      id: e.id,
      name: e.name,
      variables: e.variables.map((v) => ({
        key: v.key,
        value: v.value,
        secret: v.secret,
        enabled: v.enabled,
      })),
    })),
    // activeEnvironmentId isn't stored server-side — client tracks it locally.
    activeEnvironmentId: null,
  }
}

function dbRequestToWire(r: {
  id: string; name: string; method: string; url: string;
  params: Prisma.JsonValue; headers: Prisma.JsonValue;
  body: string; authType: string; authToken: string;
}): SavedRequest {
  return {
    id: r.id,
    name: r.name,
    method: r.method,
    url: r.url,
    params: (Array.isArray(r.params) ? r.params : []) as unknown as KeyValuePair[],
    headers: (Array.isArray(r.headers) ? r.headers : []) as unknown as KeyValuePair[],
    body: r.body,
    authType: (r.authType as 'none' | 'bearer' | 'basic') ?? 'none',
    authToken: r.authToken,
  }
}

// ─── Write (replace) ───────────────────────────────────────────────────────
// Simple strategy: delete everything the user owns, then insert from the snapshot.
// Works because our models cascade on user delete and we're operating inside a
// single transaction. Not optimal for huge datasets, but fine for this app's scale.

export async function writeSnapshot(userId: string, snap: SyncSnapshot): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.environment.deleteMany({ where: { userId } })
    await tx.collection.deleteMany({ where: { userId } })
    await tx.requestHistory.deleteMany({ where: { userId } })

    for (const env of snap.environments) {
      await tx.environment.create({
        data: {
          id: env.id,
          userId,
          name: env.name,
          variables: {
            create: env.variables.map((v) => ({
              key: v.key,
              value: v.value,
              secret: v.secret,
              enabled: v.enabled,
            })),
          },
        },
      })
    }

    for (const c of snap.collections) {
      await tx.collection.create({
        data: {
          id: c.id,
          userId,
          name: c.name,
          requests: {
            create: c.requests.map((r, idx) => ({
              id: r.id,
              name: r.name,
              method: r.method,
              url: r.url,
              params: r.params as unknown as Prisma.InputJsonValue,
              headers: r.headers as unknown as Prisma.InputJsonValue,
              body: r.body,
              authType: r.authType,
              authToken: r.authToken,
              sortOrder: idx,
            })),
          },
        },
      })

      for (let fi = 0; fi < c.folders.length; fi++) {
        const f = c.folders[fi]
        await tx.collectionFolder.create({
          data: {
            id: f.id,
            collectionId: c.id,
            name: f.name,
            sortOrder: fi,
            requests: {
              create: f.requests.map((r, idx) => ({
                id: r.id,
                collectionId: c.id,
                name: r.name,
                method: r.method,
                url: r.url,
                params: r.params as unknown as Prisma.InputJsonValue,
                headers: r.headers as unknown as Prisma.InputJsonValue,
                body: r.body,
                authType: r.authType,
                authToken: r.authToken,
                sortOrder: idx,
              })),
            },
          },
        })
      }
    }

    // History — createdAt reflects the original timestamp
    for (const h of snap.history.slice(0, 50)) {
      await tx.requestHistory.create({
        data: {
          id: h.id,
          userId,
          method: h.method,
          url: h.url,
          status: h.status,
          responseTime: h.responseTime,
          createdAt: new Date(h.timestamp),
        },
      })
    }
  })
}

// ─── Merge ─────────────────────────────────────────────────────────────────
// On login, combine local and remote state:
//   - By id: server wins (account state is canonical if it already exists)
//   - New local ids are added
//   - Useful for a user logging in on a second device or after anonymous use

export async function mergeSnapshots(
  userId: string,
  local: SyncSnapshot,
): Promise<SyncSnapshot> {
  const server = await readSnapshot(userId)

  const merged: SyncSnapshot = {
    collections: mergeById(server.collections, local.collections),
    history: mergeById(server.history, local.history).slice(0, 50),
    environments: mergeById(server.environments, local.environments),
    activeEnvironmentId: local.activeEnvironmentId ?? server.activeEnvironmentId,
  }

  await writeSnapshot(userId, merged)
  return merged
}

function mergeById<T extends { id: string }>(server: T[], local: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const s of server) {
    result.push(s)
    seen.add(s.id)
  }
  for (const l of local) {
    if (!seen.has(l.id)) {
      result.push(l)
      seen.add(l.id)
    }
  }
  return result
}
