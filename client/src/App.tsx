import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import TabBar from './components/TabBar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'
import HistoryPanel from './components/HistoryPanel'
import CollectionsPanel from './components/CollectionsPanel'
import EnvironmentManager from './components/EnvironmentManager'
import FlowPage from './components/flow/FlowPage'
import ToastContainer from './components/ToastContainer'
import { initSyncAutoPush, pullFromServer } from './lib/syncManager'

type View = 'request' | 'flow'

function App() {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [collectionsOpen, setCollectionsOpen] = useState(false)
  const [environmentsOpen, setEnvironmentsOpen] = useState(false)
  const [view, setView] = useState<View>('request')

  useEffect(() => {
    initSyncAutoPush()
    void pullFromServer()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar
        onToggleHistory={() => setHistoryOpen((o) => !o)}
        onToggleCollections={() => setCollectionsOpen((o) => !o)}
        onToggleEnvironments={() => setEnvironmentsOpen((o) => !o)}
        view={view}
        onSetView={setView}
      />

      
      {view === 'request' ? (
        <>
          <TabBar />
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="h-1/2 md:h-auto md:w-1/2 md:border-r border-b md:border-b-0 border-gray-800 overflow-auto">
              <RequestBuilder />
            </div>
            <div className="h-1/2 md:h-auto md:w-1/2 overflow-auto">
              <ResponseViewer />
            </div>
          </div>
        </>
      ) : (
        <FlowPage />
      )}
      {historyOpen && <HistoryPanel onClose={() => setHistoryOpen(false)} />}
      {collectionsOpen && <CollectionsPanel onClose={() => setCollectionsOpen(false)} />}
      {environmentsOpen && <EnvironmentManager onClose={() => setEnvironmentsOpen(false)} />}
      <ToastContainer />
    </div>
  )
}

export default App
