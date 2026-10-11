import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App'
import css from '../index.css?raw'

describe('Parent semantic section order', () => {
  it('keeps primary controls on the page and settings-only controls in the dialog', () => {
    const markup = renderToStaticMarkup(<App />)
    const sectionPosition = (id: string) => markup.indexOf(`data-parent-section="${id}"`)
    const primary = ['daily-practice', 'homework-editor', 'current-homework', 'reward-fruit', 'reward-progress'].map(sectionPosition)
    const dialogStart = markup.indexOf('id="parent-settings-dialog"')
    const dialogEnd = markup.indexOf('</dialog>', dialogStart)
    const settings = ['data-tools', 'leaf-rewards', 'vacation'].map(sectionPosition)

    expect(primary.every((position) => position >= 0)).toBe(true)
    expect(primary).toEqual([...primary].sort((left, right) => left - right))
    expect(settings.every((position) => position > dialogStart && position < dialogEnd)).toBe(true)
    expect(settings).toEqual([...settings].sort((left, right) => left - right))
    for (const id of ['data-tools', 'leaf-rewards', 'vacation']) {
      expect(markup.match(new RegExp(`data-parent-section="${id}"`, 'g'))).toHaveLength(1)
    }
    expect(markup).not.toContain('Today’s tree status')
    expect(markup).not.toContain('A little celebration?')
  })

  it('does not require CSS order declarations for the primary sequence', () => {
    expect(css).not.toMatch(/\.parent-(?:daily-section|homework-editor|current-homework|reward-section|reward-progress)\s*\{[^}]*\border\s*:/s)
  })
})
