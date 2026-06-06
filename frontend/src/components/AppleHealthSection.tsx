import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

interface MetricPrefs {
  health_metric_resting_hr: boolean
  health_metric_hrv: boolean
  health_metric_weight: boolean
  health_metric_sleep: boolean
  health_metric_vo2_max: boolean
  health_metric_active_energy: boolean
}

interface AppleHealthSectionProps extends MetricPrefs {
  onNavigateToImports: () => void
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'parsing'; taskId: string }
  | { phase: 'done'; workouts: number; metrics: number }
  | { phase: 'error'; messages: string[] }

const METRIC_LABELS: { key: keyof MetricPrefs; label: string }[] = [
  { key: 'health_metric_resting_hr', label: 'Resting HR' },
  { key: 'health_metric_hrv', label: 'HRV (SDNN)' },
  { key: 'health_metric_weight', label: 'Body Weight' },
  { key: 'health_metric_sleep', label: 'Sleep' },
  { key: 'health_metric_vo2_max', label: 'VO₂ Max' },
  { key: 'health_metric_active_energy', label: 'Active Energy' },
]

export function AppleHealthSection({
  health_metric_resting_hr,
  health_metric_hrv,
  health_metric_weight,
  health_metric_sleep,
  health_metric_vo2_max,
  health_metric_active_energy,
  onNavigateToImports,
}: AppleHealthSectionProps) {
  const qc = useQueryClient()
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' })
  const [isDragOver, setIsDragOver] = useState(false)
  const [includeWorkouts, setIncludeWorkouts] = useState(true)

  const prefMutation = useMutation({
    mutationFn: (patch: Partial<MetricPrefs>) => api.patch('/profile', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })

  function toggleMetric(key: keyof MetricPrefs, current: boolean) {
    prefMutation.mutate({ [key]: !current })
  }

  function startPolling(taskId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.get<{
          status: string
          workouts_staged: number
          metrics_saved: number
          errors: string[]
        }>(`/apple-health/status/${taskId}`)

        if (status.status === 'done') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setUploadState({
            phase: 'done',
            workouts: status.workouts_staged,
            metrics: status.metrics_saved,
          })
          qc.invalidateQueries({ queryKey: ['pending-imports'] })
        } else if (status.status === 'error') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setUploadState({ phase: 'error', messages: status.errors })
        }
      } catch {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setUploadState({ phase: 'error', messages: ['Failed to check parse status.'] })
      }
    }, 3000)
  }

  function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setUploadState({ phase: 'error', messages: ['File must be a .zip archive.'] })
      return
    }

    setUploadState({ phase: 'uploading', progress: 0 })

    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    const url = includeWorkouts ? '/api/apple-health/upload' : '/api/apple-health/upload?workouts=false'
    xhr.open('POST', url)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadState({ phase: 'uploading', progress: Math.round((e.loaded / e.total) * 100) })
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { task_id } = JSON.parse(xhr.responseText) as { task_id: string }
        setUploadState({ phase: 'parsing', taskId: task_id })
        startPolling(task_id)
      } else {
        let msg = 'Upload failed.'
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string }
          if (body.detail) msg = body.detail
        } catch { /* ignore */ }
        setUploadState({ phase: 'error', messages: [msg] })
      }
    }

    xhr.onerror = () => {
      setUploadState({ phase: 'error', messages: ['Upload failed — network error.'] })
    }

    xhr.send(formData)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const prefs = {
    health_metric_resting_hr,
    health_metric_hrv,
    health_metric_weight,
    health_metric_sleep,
    health_metric_vo2_max,
    health_metric_active_energy,
  }

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Apple Health heart icon */}
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="#FF3B5C"
          />
        </svg>
        <span className="text-sm font-semibold text-slate-700">Apple Health</span>
      </div>

      {/* Metric preferences */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-600">Tracked metrics</p>
        <div className="grid grid-cols-2 gap-2">
          {METRIC_LABELS.map(({ key, label }) => {
            const enabled = prefs[key]
            return (
              <label
                key={key}
                className="flex items-center gap-2.5 cursor-pointer select-none"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => toggleMetric(key, enabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    enabled ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Only enabled metrics will be imported and shown in Analytics
        </p>
      </div>

      {/* Upload zone */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Import data</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={includeWorkouts}
              onClick={() => setIncludeWorkouts((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                includeWorkouts ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  includeWorkouts ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-slate-600">Include workouts</span>
          </label>
        </div>

        {uploadState.phase === 'idle' || uploadState.phase === 'error' ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <p className="text-sm font-medium text-slate-600 mb-1">
                Drop Apple Health export zip here
              </p>
              <p className="text-xs text-slate-400">
                iPhone → Health app → avatar → Export All Health Data
              </p>
              <p className="text-xs text-blue-600 mt-3 font-medium">or click to select file</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadState.phase === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex flex-col gap-1">
                {uploadState.messages.map((msg, i) => (
                  <p key={i} className="text-sm text-red-700">{msg}</p>
                ))}
                <button
                  type="button"
                  className="text-xs text-red-500 underline self-start mt-0.5"
                  onClick={() => setUploadState({ phase: 'idle' })}
                >
                  Try again
                </button>
              </div>
            )}
          </>
        ) : uploadState.phase === 'uploading' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Uploading…</span>
              <span className="font-medium">{uploadState.progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
          </div>
        ) : uploadState.phase === 'parsing' ? (
          <div className="flex items-center gap-3 text-sm text-slate-600 py-2">
            <svg className="animate-spin w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Parsing your export… this may take a moment.</span>
          </div>
        ) : (
          /* done */
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 flex flex-col gap-1.5">
            <p className="text-sm text-green-800 font-medium">Import complete</p>
            <p className="text-sm text-green-700">
              {uploadState.workouts} workout{uploadState.workouts !== 1 ? 's' : ''} staged for review
              {' · '}
              {uploadState.metrics} health metric day{uploadState.metrics !== 1 ? 's' : ''} imported
            </p>
            <button
              type="button"
              className="text-sm text-green-700 underline self-start font-medium"
              onClick={onNavigateToImports}
            >
              View imports
            </button>
            <button
              type="button"
              className="text-xs text-green-600 underline self-start mt-0.5"
              onClick={() => setUploadState({ phase: 'idle' })}
            >
              Upload another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
