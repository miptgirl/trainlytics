import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ScrollToTop } from '../App'

function Page({ name }: { name: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <h1>{name}</h1>
      <Link to="/b">go b</Link>
      <Link to="/a?tab=history">same path, new query</Link>
      <button onClick={() => navigate('/c', { replace: true })}>replace c</button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  )
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <ScrollToTop />
      <Routes>
        <Route path="/a" element={<Page name="A" />} />
        <Route path="/b" element={<Page name="B" />} />
        <Route path="/c" element={<Page name="C" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  const scrollTo = vi.fn()

  beforeEach(() => {
    scrollTo.mockReset()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  })

  it('does not scroll on the initial render', () => {
    renderApp()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls to the top on a push navigation', async () => {
    renderApp()
    await userEvent.click(screen.getByText('go b'))
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('scrolls to the top on a replace navigation', async () => {
    renderApp()
    await userEvent.click(screen.getByText('replace c'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('does not scroll when only the query string changes', async () => {
    renderApp()
    await userEvent.click(screen.getByText('same path, new query'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves scroll alone on back (POP)', async () => {
    renderApp()
    await userEvent.click(screen.getByText('go b'))
    scrollTo.mockClear()
    await userEvent.click(screen.getByText('back'))
    expect(screen.getByRole('heading', { name: 'A' })).toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
