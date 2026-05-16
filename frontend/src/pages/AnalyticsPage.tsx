import { Layout } from '../components/Layout'
import { SummaryHeader } from '../components/analytics/SummaryHeader'
import { ExerciseProgressionChart } from '../components/analytics/ExerciseProgressionChart'
import { PersonalRecordsPanel } from '../components/analytics/PersonalRecordsPanel'
import { StrengthVolumeBreakdown } from '../components/analytics/StrengthVolumeBreakdown'

function SectionCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{title}</h2>
      {children ?? (
        <p className="text-slate-400 text-sm">Coming soon.</p>
      )}
    </section>
  )
}

export default function AnalyticsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>

        <SectionCard title="All-time Summary">
          <SummaryHeader />
        </SectionCard>
        <SectionCard title="Strength">
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Exercise Progression</h3>
              <ExerciseProgressionChart />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Personal Records</h3>
              <PersonalRecordsPanel />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Weekly Volume by Type</h3>
              <StrengthVolumeBreakdown />
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Cardio" />
        <SectionCard title="Readiness" />
        <SectionCard title="Consistency" />
      </div>
    </Layout>
  )
}
