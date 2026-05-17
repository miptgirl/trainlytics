import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AnalyticsPageContent } from './AnalyticsPage'
import { HistoryPageContent } from './HistoryPage'

export default function StatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'analytics'

  return (
    <Layout>
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setSearchParams({})}
          className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'history' })}
          className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'analytics' ? <AnalyticsPageContent /> : <HistoryPageContent />}
    </Layout>
  )
}
