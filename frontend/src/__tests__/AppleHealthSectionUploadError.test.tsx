import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn().mockResolvedValue({}) },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

import { AppleHealthSection } from '../components/AppleHealthSection'

// Minimal XHR stand-in: send() immediately "completes" with the queued response.
let nextResponse: { status: number; body: string }

class FakeXHR {
  status = 0
  responseText = ''
  upload = { onprogress: null as unknown }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  open() {}
  setRequestHeader() {}
  send() {
    this.status = nextResponse.status
    this.responseText = nextResponse.body
    this.onload?.()
  }
}

function renderSection() {
  const qc = new QueryClient()
  const { container } = render(
    <QueryClientProvider client={qc}>
      <AppleHealthSection
        health_metric_resting_hr
        health_metric_hrv
        health_metric_weight
        health_metric_sleep
        health_metric_vo2_max
        health_metric_active_energy
        onNavigateToImports={() => {}}
      />
    </QueryClientProvider>,
  )
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

function uploadZip(input: HTMLInputElement) {
  const file = new File(['zip'], 'export.zip', { type: 'application/zip' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('AppleHealthSection — upload error detail', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a FastAPI 422 list detail as joined messages', () => {
    nextResponse = {
      status: 422,
      body: JSON.stringify({
        detail: [
          { type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null },
          { type: 'bool_parsing', loc: ['query', 'workouts'], msg: 'Input should be a valid boolean' },
        ],
      }),
    }
    uploadZip(renderSection())
    expect(
      screen.getByText('Field required; Input should be a valid boolean'),
    ).toBeInTheDocument()
  })

  it('renders a string detail unchanged', () => {
    nextResponse = { status: 400, body: JSON.stringify({ detail: 'Not a valid Apple Health export.' }) }
    uploadZip(renderSection())
    expect(screen.getByText('Not a valid Apple Health export.')).toBeInTheDocument()
  })
})
