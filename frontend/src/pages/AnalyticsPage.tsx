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

function SectionCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{title}</h2>
      {children ?? <p className="text-slate-400 text-sm">Coming soon.</p>}
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

export function AnalyticsPageContent() {
  const [showMoreStrength, setShowMoreStrength] = useState(false)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>

      <SectionCard title="All-time Summary">
        <SummaryHeader />
      </SectionCard>

      <SectionCard title="Consistency">
        <ConsistencyHeatmap />
      </SectionCard>

      <SectionCard title="Overview">
        <OverviewTrendsChart />
      </SectionCard>

      <SectionCard title="Strength">
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Weekly Volume by Type</h3>
            <StrengthVolumeBreakdown />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Weekly Exercises by Type</h3>
            <WeeklyExercisesByTypeChart />
          </div>

          {showMoreStrength ? (
            <>
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-3">Exercise Progression</h3>
                <ExerciseProgressionChart />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-3">Personal Records</h3>
                <PersonalRecordsPanel />
              </div>
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
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Activity Time Split</h3>
            <ActivityTimeSplitChart />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Walk Segments per Session</h3>
            <WalkSegmentsTrendChart />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Distance Progression</h3>
            <CardioDistanceProgressionChart />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Training Load</h3>
            <TrainingLoadChart />
          </div>
        </div>
      </CollapsibleSectionCard>

      <SectionCard title="Readiness">
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Weekly Trends</h3>
            <ReadinessTrendsChart />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Wellbeing vs RPE Correlation</h3>
            <WellbeingCorrelationChart />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Plan Adherence">
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
