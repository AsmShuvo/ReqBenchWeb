import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { logout } from '../lib/syncManager'
import AuthModal from './AuthModal'

interface Props {
  view: 'request' | 'flow'
  onSetView: (v: 'request' | 'flow') => void
  onToggleCollections: () => void
}

export default function Navbar({ view, onSetView, onToggleCollections }: Props) {
  const user = useAuthStore((s) => s.user)
  const [authOpen, setAuthOpen] = useState(false)

  return (
    <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold">ReqBench</span>
        <button
          onClick={onToggleCollections}
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded hover:bg-gray-800 cursor-pointer"
        >
          Collections
        </button>
        <div className="flex bg-gray-800 rounded border border-gray-700">
          <button
            onClick={() => onSetView('request')}
            className={`text-xs px-3 py-1 cursor-pointer ${view === 'request' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
          >
            Request
          </button>
          <button
            onClick={() => onSetView('flow')}
            className={`text-xs px-3 py-1 cursor-pointer ${view === 'flow' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
          >
            Flow
          </button>
        </div>
      </div>

      {user ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">{user.name || user.email}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAuthOpen(true)}
          className="text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          Sign in
        </button>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </nav>
  )
}
