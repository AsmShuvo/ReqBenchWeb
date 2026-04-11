import { create } from 'zustand'
import { environmentsRepo } from '../repositories'
import type { Environment, EnvVariable } from '../repositories/types'

// Re-export types for backward compatibility with component imports
export type { Environment, EnvVariable } from '../repositories/types'

interface EnvironmentStore {
  environments: Environment[]
  activeEnvironmentId: string | null
  _loaded: boolean
  _load: () => Promise<void>

  createEnvironment: (name: string) => void
  renameEnvironment: (id: string, name: string) => void
  deleteEnvironment: (id: string) => void
  setActiveEnvironment: (id: string | null) => void
  updateVariables: (envId: string, variables: EnvVariable[]) => void
}

export const useEnvironmentStore = create<EnvironmentStore>((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  _loaded: false,

  _load: async () => {
    if (get()._loaded) return
    const state = await environmentsRepo.load()
    set({
      environments: state.environments,
      activeEnvironmentId: state.activeEnvironmentId,
      _loaded: true,
    })
  },

  createEnvironment: (name) => {
    environmentsRepo.createEnvironment(name).then((state) => {
      set({ environments: state.environments })
    })
  },

  renameEnvironment: (id, name) => {
    set((state) => ({
      environments: state.environments.map((e) => (e.id === id ? { ...e, name } : e)),
    }))
    environmentsRepo.renameEnvironment(id, name)
  },

  deleteEnvironment: (id) => {
    set((state) => ({
      environments: state.environments.filter((e) => e.id !== id),
      activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
    }))
    environmentsRepo.deleteEnvironment(id)
  },

  setActiveEnvironment: (id) => {
    set({ activeEnvironmentId: id })
    environmentsRepo.setActiveEnvironment(id)
  },

  updateVariables: (envId, variables) => {
    set((state) => ({
      environments: state.environments.map((e) =>
        e.id === envId ? { ...e, variables } : e,
      ),
    }))
    environmentsRepo.updateVariables(envId, variables)
  },
}))

// Eagerly load on module init
useEnvironmentStore.getState()._load()
