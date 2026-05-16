import { Layout } from '../components/Layout'

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

        <SectionCard title="All-time Summary" />
        <SectionCard title="Strength" />
        <SectionCard title="Cardio" />
        <SectionCard title="Readiness" />
        <SectionCard title="Consistency" />
      </div>
    </Layout>
  )
}
