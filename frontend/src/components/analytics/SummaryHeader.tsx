import { useAnalyticsSummary } from '../../lib/analyticsApi'

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function StatSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 animate-pulse">
      <div className="h-8 w-20 bg-slate-200 rounded" />
      <div className="h-3 w-16 bg-slate-100 rounded" />
    </div>
  )
}

export function SummaryHeader() {
  const { data, isLoading } = useAnalyticsSummary()

  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      {isLoading || !data ? (
        <>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </>
      ) : (
        <>
          <StatBlock label="Total time" value={formatMinutes(data.total_minutes)} />
          <StatBlock label="Sessions logged" value={String(data.total_sessions)} />
          <StatBlock label="Distance run" value={`${data.total_distance_km.toFixed(1)} km`} />
        </>
      )}
    </div>
  )
}
