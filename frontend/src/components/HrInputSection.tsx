import { useState, useEffect } from 'react'
import { TimeInput } from './TimeInput'

const ZONE_LABELS = [
  { label: 'Z1', bpmRange: '< 132' },
  { label: 'Z2', bpmRange: '133–144' },
  { label: 'Z3', bpmRange: '145–157' },
  { label: 'Z4', bpmRange: '158–169' },
  { label: 'Z5', bpmRange: '≥ 170' },
] as const

export interface HrInputSectionProps {
  avgHrBpm: string
  onAvgHrBpmChange: (value: string) => void
  zoneSeconds: [number | null, number | null, number | null, number | null, number | null]
  onZoneChange: (index: number, seconds: number | null) => void
}

export function HrInputSection({
  avgHrBpm,
  onAvgHrBpmChange,
  zoneSeconds,
  onZoneChange,
}: HrInputSectionProps) {
  const hasAnyData = avgHrBpm !== '' || zoneSeconds.some((v) => v !== null)
  const [expanded, setExpanded] = useState(hasAnyData)

  useEffect(() => {
    if (hasAnyData) setExpanded(true)
  }, [hasAnyData])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <span>Add HR data</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Avg HR (bpm)</label>
            <input
              type="number"
              min="0"
              max="250"
              placeholder="e.g. 148"
              value={avgHrBpm}
              onChange={(e) => onAvgHrBpmChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500">Time in zones (optional, from Apple Health)</p>
            {ZONE_LABELS.map((zone, i) => (
              <div key={zone.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-24 shrink-0">
                  {zone.label} ({zone.bpmRange})
                </span>
                <TimeInput
                  value={zoneSeconds[i]}
                  onChange={(v) => onZoneChange(i, v)}
                  format="duration"
                  placeholder="h:mm:ss"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
