import type { EnvironmentsRepository } from '../interfaces'
import type { EnvironmentsState, EnvVariable } from '../types'

const STORAGE_KEY = 'reqbench-environments'

const DEFAULT_STATE: EnvironmentsState = {
  environments: [
    {
      id: crypto.randomUUID(),
      name: 'Development',
      variables: [
        { key: 'baseUrl', value: 'http://localhost:3001', secret: false, enabled: true },
      ],
    },
  ],
  activeEnvironmentId: null, // set after creation
}

// Initialize default so activeEnvironmentId points to the first env
DEFAULT_STATE.activeEnvironmentId = DEFAULT_STATE.environments[0].id

function readState(): EnvironmentsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    const state = parsed.state ?? parsed
    if (!state.environments || state.environments.length === 0) return DEFAULT_STATE
    return {
      environments: state.environments,
      activeEnvironmentId: state.activeEnvironmentId ?? null,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(state: EnvironmentsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export class LocalEnvironmentsRepository implements EnvironmentsRepository {
  async load(): Promise<EnvironmentsState> {
    return readState()
  }

  async save(state: EnvironmentsState): Promise<void> {
    writeState(state)
  }

  async createEnvironment(name: string): Promise<EnvironmentsState> {
    const state = readState()
    const env = { id: crypto.randomUUID(), name, variables: [] }
    const updated = { ...state, environments: [...state.environments, env] }
    writeState(updated)
    return updated
  }

  async renameEnvironment(id: string, name: string): Promise<void> {
    const state = readState()
    writeState({
      ...state,
      environments: state.environments.map((e) => (e.id === id ? { ...e, name } : e)),
    })
  }

  async deleteEnvironment(id: string): Promise<EnvironmentsState> {
    const state = readState()
    const updated: EnvironmentsState = {
      environments: state.environments.filter((e) => e.id !== id),
      activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
    }
    writeState(updated)
    return updated
  }

  async setActiveEnvironment(id: string | null): Promise<void> {
    const state = readState()
    writeState({ ...state, activeEnvironmentId: id })
  }

  async updateVariables(envId: string, variables: EnvVariable[]): Promise<void> {
    const state = readState()
    writeState({
      ...state,
      environments: state.environments.map((e) =>
        e.id === envId ? { ...e, variables } : e,
      ),
    })
  }
}
