import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AnalyticsPageContent } from './AnalyticsPage'
import { HistoryPageContent } from './HistoryPage'

export default function StatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'analytics'

  return (
    <Layout>
      <div className="flex gap-1 bg-bg rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setSearchParams({})}
          className={`text-sm px-4 py-1.5 max-md:min-h-11 max-md:min-w-11 rounded-lg font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'bg-surface text-primary-dark shadow-sm'
              : 'text-text-muted-strong'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'history' })}
          className={`text-sm px-4 py-1.5 max-md:min-h-11 max-md:min-w-11 rounded-lg font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-surface text-primary-dark shadow-sm'
              : 'text-text-muted-strong'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'analytics' ? <AnalyticsPageContent /> : <HistoryPageContent />}
    </Layout>
  )
}
