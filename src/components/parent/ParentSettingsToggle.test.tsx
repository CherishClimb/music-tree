// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../App'

afterEach(() => {
  cleanup()
})

describe('Parent Leaf Rewards settings toggle', () => {
  it('starts collapsed, opens and closes accessibly, and keeps draft values', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: 'Settings' })
    const panel = document.getElementById('leaf-reward-settings-panel') as HTMLElement

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.hidden).toBe(true)
    expect(screen.queryByRole('spinbutton', { name: 'Daily Practice Goal' })).toBeNull()
    expect(screen.queryByText('Your Music Tree is glowing softly tonight.')).toBeNull()

    await user.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    const dailyGoal = screen.getByRole('spinbutton', { name: 'Daily Practice Goal' }) as HTMLInputElement
    await user.clear(dailyGoal)
    await user.type(dailyGoal, '35')

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)

    await user.click(toggle)
    expect(dailyGoal.value).toBe('35')
  })
})