import { useState } from 'react'
import { useEscape } from '../lib/useEscape'
import { login, signup } from '../lib/syncManager'
import { useToast } from '../store/useToastStore'

type Mode = 'signup' | 'login'

export default function AuthModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signup(email, password, name || undefined)
        toast.success('Account created — local data synced')
      } else {
        await login(email, password)
        toast.success('Signed in — synced with cloud')
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-white">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white text-xl cursor-pointer px-1"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex border border-gray-700 rounded overflow-hidden">
            <button
              onClick={() => { setMode('login'); setError(null) }}
              className={`flex-1 text-sm py-2 cursor-pointer ${mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Log in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null) }}
              className={`flex-1 text-sm py-2 cursor-pointer ${mode === 'signup' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Sign up
            </button>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="auth-name">Name (optional)</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="auth-password">
              Password {mode === 'signup' && <span className="text-gray-500">(at least 8 characters)</span>}
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) submit() }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded cursor-pointer"
          >
            {loading ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <div className="pt-2 border-t border-gray-800 text-center">
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Continue without an account →
            </button>
            <p className="text-[11px] text-gray-600 mt-1">
              ReqBench works fully offline. Sign in only if you want cloud sync across devices.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
