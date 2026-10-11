// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'

afterEach(() => {
  cleanup()
})

describe('Parent Settings dialog', () => {
  it('opens as a dialog, consolidates controls, retains drafts, and restores focus when closed', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: 'Settings' })
    const dialog = document.getElementById('parent-settings-dialog') as HTMLDialogElement

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(dialog.id)
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog')
    expect(dialog.open).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Daily Practice Goal' })).toBeNull()
    expect(screen.queryByText('Your Music Tree is glowing softly tonight.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Today’s tree status' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'A little celebration?' })).toBeNull()

    await user.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(dialog.open).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBe(dialog)
    expect(dialog.contains(screen.getByRole('heading', { name: 'Child Profile' }))).toBe(true)
    expect(dialog.contains(screen.getByRole('heading', { name: 'Data & Backup' }))).toBe(true)
    const vacationHeading = screen.getByRole('heading', { name: 'Urlaub / Pause' })
    const vacationSection = vacationHeading.closest('section') as HTMLElement
    expect(dialog.contains(vacationSection)).toBe(true)
    expect(screen.getAllByRole('heading', { name: 'Urlaub / Pause' })).toHaveLength(1)
    expect(screen.getByLabelText('Start date')).toBeTruthy()
    expect(screen.getByLabelText('End date')).toBeTruthy()
    expect(screen.getByLabelText('Optional note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Urlaub' })).toBeTruthy()
    expect(dialog.querySelectorAll('[data-settings-section="child-profile"]')).toHaveLength(1)
    expect(dialog.contains(screen.getByRole('button', { name: 'Export complete backup' }))).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Export complete backup' })).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getAllByRole('button', { name: /^Choose .+ avatar$/ })).toHaveLength(5)
    const rainbowAvatar = screen.getByRole('button', { name: 'Choose Rainbow Unicorn avatar' })
    await user.click(rainbowAvatar)
    await user.click(screen.getByRole('button', { name: 'Save child profile' }))
    expect(rainbowAvatar.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Child profile saved.')
    const dailyGoal = screen.getByRole('spinbutton', { name: 'Daily Practice Goal' }) as HTMLInputElement
    await user.clear(dailyGoal)
    await user.type(dailyGoal, '35')

    await user.keyboard('{Escape}')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(toggle)

    await user.click(toggle)
    expect(dailyGoal.value).toBe('35')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(toggle)
  }, 10_000)
})
