// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialTreeState } from '../../domain/treeGrowthEngine'
import { ChildPage } from '../../pages/ChildPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const englishParagraphs = [
  'Once upon a time, in a magical garden, there lived a little tree that loved music more than anything.',
  'Whenever beautiful music filled the air, its branches danced gently, and a tiny new leaf could unfold. Sometimes, a long practice brought a new leaf. Sometimes, a little practice played with great care was enough. And sometimes, a wonderful breakthrough made the tree sparkle with joy.',
  'As melodies filled the garden day after day, the tree grew stronger, passing through five magical stages, each more wonderful than the last.',
  "But hidden among the bushes lived a mischievous little creature who adored the tree's tender leaves. As long as music played, he dared not come near. Yet if the garden fell silent for three whole days, he would tiptoe out and steal five leaves for a delicious feast. If the silence continued, he might return three days later!",
  'During holidays, a gentle spell protected the garden, and even the little thief had to stay away.',
  'But the Music Tree never lost its magic. Whenever music returned, its branches stirred with joy, ready to grow once more.',
  'And if you listen very closely, you might hear it whisper among the leaves:',
  '“Play me a melody, and I\'ll grow a little dream for you.”',
]

const renderChildPage = () => render(
  <ChildPage treeState={createInitialTreeState()} practiceRecords={[]} homeworkItems={[]} parentRewards={[]} leafState={{ migrationBaseEarnedLeafCount: 0, eventLeafCount: 0, earnedLeafCount: 0, visibleLeafCount: 0 }} />,
)

describe('Music Tree story', () => {
  it('opens in English with the exact approved wording and closes with its control', async () => {
    const user = userEvent.setup()
    renderChildPage()

    const openButton = screen.getByRole('button', { name: /Story/ })
    await user.click(openButton)
    const dialog = screen.getByRole('dialog', { name: 'The Secret of the Music Tree' })
    expect(within(dialog).getAllByRole('paragraph').map((paragraph) => paragraph.textContent)).toEqual(englishParagraphs)
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Close story' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(openButton)
  })

  it('switches between natural German, Simplified Chinese, and English story text only', async () => {
    const user = userEvent.setup()
    renderChildPage()
    await user.click(screen.getByRole('button', { name: /Story/ }))

    const tree = screen.getByRole('region', { name: 'Your magical Music Tree' })
    const treeMarkup = tree.innerHTML
    const pageHeading = screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)
    const savedState = { ...localStorage }
    const save = vi.spyOn(Storage.prototype, 'setItem')
    await user.click(screen.getByRole('button', { name: 'Deutsch' }))
    expect(screen.getByRole('dialog', { name: 'Das Geheimnis des Musikbaums' })).toBeTruthy()
    expect(screen.getByText(/Es war einmal, in einem zauberhaften Garten/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '中文' }))
    const chineseStory = screen.getByRole('dialog', { name: '音乐树的秘密' })
    expect(within(chineseStory).getByText(/从前，在一个神奇的花园里/)).toBeTruthy()
    expect(chineseStory.querySelector('.story-scroll')?.getAttribute('lang')).toBe('zh-Hans')

    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('dialog', { name: 'The Secret of the Music Tree' })).toBeTruthy()
    expect(tree.innerHTML).toBe(treeMarkup)
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual(pageHeading)
    expect({ ...localStorage }).toEqual(savedState)
    expect(save).not.toHaveBeenCalled()
  })

  it('resets to English when reopened and restores page scrolling on close', async () => {
    const user = userEvent.setup()
    renderChildPage()
    const previousOverflow = document.body.style.overflow
    await user.click(screen.getByRole('button', { name: /Story/ }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Deutsch' }))
    await user.click(screen.getByRole('button', { name: 'Close story' }))
    expect(document.body.style.overflow).toBe(previousOverflow)
    await user.click(screen.getByRole('button', { name: /Story/ }))
    expect(screen.getByRole('dialog', { name: 'The Secret of the Music Tree' })).toBeTruthy()
  })

  it('supports Escape, restores focus, and keeps keyboard focus inside the dialog', async () => {
    const user = userEvent.setup()
    renderChildPage()
    const openButton = screen.getByRole('button', { name: /Story/ })
    await user.click(openButton)

    const closeButton = screen.getByRole('button', { name: 'Close story' })
    expect(document.activeElement).toBe(closeButton)
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'The Secret of the Music Tree' }))
    await user.tab()
    expect(document.activeElement).toBe(closeButton)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'English' }))
    await user.tab()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'The Secret of the Music Tree' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(openButton)
  })
})
