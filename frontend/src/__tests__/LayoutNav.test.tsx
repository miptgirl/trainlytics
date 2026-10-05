import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

const logout = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 't', username: 'demo', logout, isLoading: false }),
}))

import { Layout } from '../components/Layout'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <p>content</p>
      </Layout>
    </MemoryRouter>,
  )
}

function tabBar() {
  return screen.queryByRole('navigation', { name: 'Primary' })
}

describe('Layout mobile shell', () => {
  it.each([
    ['/today', 'Today'],
    ['/plan', 'Plan'],
    ['/stats', 'Stats'],
    ['/sessions/12', 'Stats'],
  ])('marks the right tab active on %s', (path, label) => {
    renderAt(path)
    const links = within(tabBar()!).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'Plan', 'Stats'])
    const active = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active.map((l) => l.textContent)).toEqual([label])
  })

  it('has no active tab on other routes', () => {
    renderAt('/templates')
    expect(
      within(tabBar()!).queryAllByRole('link').filter((l) => l.hasAttribute('aria-current')),
    ).toHaveLength(0)
  })

  it.each(['/log', '/workout'])('hides the tab bar on %s', (path) => {
    renderAt(path)
    expect(tabBar()).not.toBeInTheDocument()
  })

  it('opens the menu sheet with its links and signs out', async () => {
    renderAt('/plan')
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    const hrefs = within(dialog).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toEqual(['/templates', '/steps', '/profile', '/settings'])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['/login', '/logout', '/logbook'])('keeps the tab bar on %s (not a /log route)', (path) => {
    renderAt(path)
    expect(tabBar()).toBeInTheDocument()
  })

  it('exposes the open state and returns focus to the trigger on Escape', async () => {
    renderAt('/plan')
    const trigger = screen.getAllByRole('button', { name: 'Open menu' })[0]
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('traps Tab inside the sheet', async () => {
    renderAt('/plan')
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    const signOut = within(dialog).getByRole('button', { name: 'Sign out' })
    signOut.focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(signOut).toHaveFocus()
  })

  it('closes when a menu link navigates', async () => {
    renderAt('/plan')
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Steps' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists Today first in the desktop nav', () => {
    renderAt('/plan')
    const nav = screen.getAllByRole('navigation').find((n) => n.className.includes('hidden md:flex'))!
    expect(within(nav).getAllByRole('link')[0]).toHaveTextContent('Today')
  })
})
