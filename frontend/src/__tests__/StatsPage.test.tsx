import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

// Stub out heavy sub-tab contents so the smoke test stays fast and isolated
vi.mock('../pages/AnalyticsPage', () => ({
  AnalyticsPageContent: () => <div data-testid="analytics-content">Analytics</div>,
}))

vi.mock('../pages/HistoryPage', () => ({
  HistoryPageContent: () => <div data-testid="history-content">History</div>,
}))

import StatsPage from '../pages/StatsPage'

function renderPage(initialPath = '/stats') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <StatsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StatsPage', () => {
  it('renders Analytics sub-tab by default', () => {
    renderPage()
    expect(screen.getByTestId('analytics-content')).toBeInTheDocument()
    expect(screen.queryByTestId('history-content')).not.toBeInTheDocument()
  })

  it('renders History sub-tab when ?tab=history is in the URL', () => {
    renderPage('/stats?tab=history')
    expect(screen.getByTestId('history-content')).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-content')).not.toBeInTheDocument()
  })

  it('shows both sub-tab buttons', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
  })

  it('switches to History when the History button is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /history/i }))
    expect(screen.getByTestId('history-content')).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-content')).not.toBeInTheDocument()
  })
})
