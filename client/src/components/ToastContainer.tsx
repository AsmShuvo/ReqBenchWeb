import { useToastStore } from '../store/useToastStore'

const kindStyles: Record<string, string> = {
  success: 'bg-green-600 border-green-500 text-white',
  error: 'bg-red-600 border-red-500 text-white',
  info: 'bg-gray-800 border-gray-700 text-gray-100',
}

const icons: Record<string, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 border rounded shadow-lg px-4 py-2 text-sm max-w-sm pointer-events-auto ${kindStyles[t.kind]}`}
        >
          <span aria-hidden="true" className="font-bold">{icons[t.kind]}</span>
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-white/70 hover:text-white text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
