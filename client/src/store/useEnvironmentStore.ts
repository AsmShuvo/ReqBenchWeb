import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

interface EnvironmentStore {
  environments: Environment[]
  activeEnvironmentId: string | null

  createEnvironment: (name: string) => void
  renameEnvironment: (id: string, name: string) => void
  deleteEnvironment: (id: string) => void
  setActiveEnvironment: (id: string | null) => void
  updateVariables: (envId: string, variables: EnvVariable[]) => void
}

const defaultEnv: Environment = {
  id: crypto.randomUUID(),
  name: 'Development',
  variables: [
    { key: 'baseUrl', value: 'http://localhost:3001', secret: false, enabled: true },
  ],
}

export const useEnvironmentStore = create<EnvironmentStore>()(
  persist(
    (set) => ({
      environments: [defaultEnv],
      activeEnvironmentId: defaultEnv.id,

      createEnvironment: (name) => {
        const env: Environment = {
          id: crypto.randomUUID(),
          name,
          variables: [],
        }
        set((state) => ({
          environments: [...state.environments, env],
        }))
      },

      renameEnvironment: (id, name) =>
        set((state) => ({
          environments: state.environments.map((e) =>
            e.id === id ? { ...e, name } : e,
          ),
        })),

      deleteEnvironment: (id) =>
        set((state) => ({
          environments: state.environments.filter((e) => e.id !== id),
          activeEnvironmentId:
            state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
        })),

      setActiveEnvironment: (id) => set({ activeEnvironmentId: id }),

      updateVariables: (envId, variables) =>
        set((state) => ({
          environments: state.environments.map((e) =>
            e.id === envId ? { ...e, variables } : e,
          ),
        })),
    }),
    { name: 'reqbench-environments' },
  ),
)
