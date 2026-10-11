import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App'
import css from '../index.css?raw'

describe('Parent semantic section order', () => {
  it('renders every primary section in visual and keyboard order before Urlaub and Data Tools', () => {
    const markup = renderToStaticMarkup(<App />)
    const sectionPosition = (id: string) => markup.indexOf(`data-parent-section="${id}"`)
    const primary = ['daily-practice', 'leaf-rewards', 'homework-editor', 'current-homework', 'reward-fruit', 'reward-progress'].map(sectionPosition)

    expect(primary.every((position) => position >= 0)).toBe(true)
    expect(primary).toEqual([...primary].sort((left, right) => left - right))
    expect(sectionPosition('vacation')).toBeGreaterThan(primary.at(-1)!)
    expect(sectionPosition('data-tools')).toBeGreaterThan(primary.at(-1)!)
  })

  it('does not require CSS order declarations for the primary sequence', () => {
    expect(css).not.toMatch(/\.parent-(?:daily-section|homework-editor|current-homework|reward-section|reward-progress)\s*\{[^}]*\border\s*:/s)
  })
})
