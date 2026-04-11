import type { HistoryRepository, CollectionsRepository, EnvironmentsRepository } from './interfaces'
import { LocalHistoryRepository } from './local/historyRepo'
import { LocalCollectionsRepository } from './local/collectionsRepo'
import { LocalEnvironmentsRepository } from './local/environmentsRepo'

export type { HistoryRepository, CollectionsRepository, EnvironmentsRepository }

// Active repository instances.
// To switch to remote storage later, swap these with API-backed implementations.
export const historyRepo: HistoryRepository = new LocalHistoryRepository()
export const collectionsRepo: CollectionsRepository = new LocalCollectionsRepository()
export const environmentsRepo: EnvironmentsRepository = new LocalEnvironmentsRepository()
