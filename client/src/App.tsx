import Navbar from './components/Navbar'
import TabBar from './components/TabBar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'

function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar />
      <TabBar />
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Request Builder */}
        <div className="w-1/2 border-r border-gray-800 overflow-auto">
          <RequestBuilder />
        </div>
        {/* Right Panel - Response Viewer */}
        <div className="w-1/2 overflow-auto">
          <ResponseViewer />
        </div>
      </div>
    </div>
  )
}

export default App
