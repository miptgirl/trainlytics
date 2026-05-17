import { useState } from 'react'
import { Layout } from '../components/Layout'
import { SummaryHeader } from '../components/analytics/SummaryHeader'
import { ConsistencyHeatmap } from '../components/analytics/ConsistencyHeatmap'
import { OverviewTrendsChart } from '../components/analytics/OverviewTrendsChart'
import { StrengthVolumeBreakdown } from '../components/analytics/StrengthVolumeBreakdown'
import { WeeklyExercisesByTypeChart } from '../components/analytics/WeeklyExercisesByTypeChart'
import { ExerciseProgressionChart } from '../components/analytics/ExerciseProgressionChart'
import { PersonalRecordsPanel } from '../components/analytics/PersonalRecordsPanel'
import { ActivityTimeSplitChart } from '../components/analytics/ActivityTimeSplitChart'
import { WalkSegmentsTrendChart } from '../components/analytics/WalkSegmentsTrendChart'
import { CardioDistanceProgressionChart } from '../components/analytics/CardioDistanceProgressionChart'
import { TrainingLoadChart } from '../components/analytics/TrainingLoadChart'
import { ReadinessTrendsChart } from '../components/analytics/ReadinessTrendsChart'
import { WellbeingCorrelationChart } from '../components/analytics/WellbeingCorrelationChart'
import { PlanAdherenceChart } from '../components/analytics/PlanAdherenceChart'
import { SqlDebugModal } from '../components/analytics/SqlDebugModal'

function DebugIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-slate-300 hover:text-slate-500 font-mono transition-colors px-1.5 py-0.5 rounded shrink-0"
      title="View SQL"
    >
      {'</>'}
    </button>
  )
}

function SectionCard({
  title,
  debugUrl,
  children,
}: {
  title: string
  debugUrl?: string
  children?: React.ReactNode
}) {
  const [debugOpen, setDebugOpen] = useState(false)
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {debugUrl && <DebugIcon onClick={() => setDebugOpen(true)} />}
      </div>
      {children ?? <p className="text-slate-400 text-sm">Coming soon.</p>}
      {debugUrl && (
        <SqlDebugModal
          fetchUrl={debugUrl}
          isOpen={debugOpen}
          onClose={() => setDebugOpen(false)}
          title={title}
        />
      )}
    </section>
  )
}

function CollapsibleSectionCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <span className="ml-2 text-slate-400 text-sm select-none">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  )
}

function ChartPanel({
  title,
  debugUrl,
  children,
}: {
  title: string
  debugUrl: string
  children: React.ReactNode
}) {
  const [debugOpen, setDebugOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
        <DebugIcon onClick={() => setDebugOpen(true)} />
      </div>
      {children}
      <SqlDebugModal
        fetchUrl={debugUrl}
        isOpen={debugOpen}
        onClose={() => setDebugOpen(false)}
        title={title}
      />
    </div>
  )
}

export function AnalyticsPageContent() {
  const [showMoreStrength, setShowMoreStrength] = useState(false)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>

      <SectionCard title="All-time Summary" debugUrl="/analytics/summary">
        <SummaryHeader />
      </SectionCard>

      <SectionCard title="Consistency" debugUrl="/analytics/heatmap">
        <ConsistencyHeatmap />
      </SectionCard>

      <SectionCard title="Overview" debugUrl="/analytics/overview-trends">
        <OverviewTrendsChart />
      </SectionCard>

      <SectionCard title="Strength">
        <div className="space-y-8">
          <ChartPanel
            title="Weekly Volume by Type"
            debugUrl="/analytics/strength/volume-by-tag?weeks=12"
          >
            <StrengthVolumeBreakdown />
          </ChartPanel>
          <ChartPanel
            title="Weekly Exercises by Type"
            debugUrl="/analytics/strength/exercises-by-type?weeks=12"
          >
            <WeeklyExercisesByTypeChart />
          </ChartPanel>

          {showMoreStrength ? (
            <>
              <ChartPanel
                title="Exercise Progression"
                debugUrl="/analytics/strength/progression"
              >
                <ExerciseProgressionChart />
              </ChartPanel>
              <ChartPanel
                title="Personal Records"
                debugUrl="/analytics/strength/records"
              >
                <PersonalRecordsPanel />
              </ChartPanel>
              <button
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setShowMoreStrength(false)}
              >
                Show less ▲
              </button>
            </>
          ) : (
            <button
              className="text-sm text-blue-600 hover:text-blue-700 transition-colors font-medium"
              onClick={() => setShowMoreStrength(true)}
            >
              Show more ▼
            </button>
          )}
        </div>
      </SectionCard>

      <CollapsibleSectionCard title="Cardio" defaultOpen={false}>
        <div className="space-y-8">
          <ChartPanel
            title="Activity Time Split"
            debugUrl="/analytics/cardio/time-split?period=90"
          >
            <ActivityTimeSplitChart />
          </ChartPanel>
          <ChartPanel
            title="Walk Segments per Session"
            debugUrl="/analytics/cardio/walk-segments"
          >
            <WalkSegmentsTrendChart />
          </ChartPanel>
          <ChartPanel
            title="Distance Progression"
            debugUrl="/analytics/cardio/distance-progression"
          >
            <CardioDistanceProgressionChart />
          </ChartPanel>
          <ChartPanel
            title="Training Load"
            debugUrl="/analytics/training-load"
          >
            <TrainingLoadChart />
          </ChartPanel>
        </div>
      </CollapsibleSectionCard>

      <SectionCard title="Readiness">
        <div className="space-y-8">
          <ChartPanel
            title="Weekly Trends"
            debugUrl="/analytics/readiness/trends"
          >
            <ReadinessTrendsChart />
          </ChartPanel>
          <ChartPanel
            title="Wellbeing vs RPE Correlation"
            debugUrl="/analytics/readiness/correlation"
          >
            <WellbeingCorrelationChart />
          </ChartPanel>
        </div>
      </SectionCard>

      <SectionCard title="Plan Adherence" debugUrl="/analytics/plan-adherence?weeks=12">
        <PlanAdherenceChart />
      </SectionCard>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <Layout>
      <AnalyticsPageContent />
    </Layout>
  )
}
