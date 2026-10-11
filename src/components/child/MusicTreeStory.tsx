import { useEffect, useRef, useState } from 'react'

type StoryLanguage = 'en' | 'de' | 'zh'

const STORIES: Record<StoryLanguage, { title: string; paragraphs: readonly string[] }> = {
  en: {
    title: 'The Secret of the Music Tree',
    paragraphs: [
      'Once upon a time, in a magical garden, there lived a little tree that loved music more than anything.',
      'Whenever beautiful music filled the air, its branches danced gently, and a tiny new leaf could unfold. Sometimes, a long practice brought a new leaf. Sometimes, a little practice played with great care was enough. And sometimes, a wonderful breakthrough made the tree sparkle with joy.',
      'As melodies filled the garden day after day, the tree grew stronger, passing through five magical stages, each more wonderful than the last.',
      "But hidden among the bushes lived a mischievous little creature who adored the tree's tender leaves. As long as music played, he dared not come near. Yet if the garden fell silent for three whole days, he would tiptoe out and steal five leaves for a delicious feast. If the silence continued, he might return three days later!",
      'During holidays, a gentle spell protected the garden, and even the little thief had to stay away.',
      'But the Music Tree never lost its magic. Whenever music returned, its branches stirred with joy, ready to grow once more.',
      'And if you listen very closely, you might hear it whisper among the leaves:',
      '“Play me a melody, and I\'ll grow a little dream for you.”',
    ],
  },
  de: {
    title: 'Das Geheimnis des Musikbaums',
    paragraphs: [
      'Es war einmal, in einem zauberhaften Garten, ein kleiner Baum, der Musik mehr liebte als alles andere.',
      'Wann immer wunderschöne Musik durch die Luft klang, tanzten seine Zweige sanft, und ein winziges neues Blatt konnte sich entfalten. Manchmal ließ langes Üben ein neues Blatt wachsen. Manchmal genügte schon ein wenig Üben, wenn jeder Ton mit großer Sorgfalt gespielt wurde. Und manchmal brachte ein wundervoller Durchbruch den Baum vor Freude zum Funkeln.',
      'Während Tag für Tag Melodien den Garten erfüllten, wurde der Baum immer stärker und durchlief fünf magische Stufen, eine wunderbarer als die andere.',
      'Doch verborgen zwischen den Büschen lebte ein schelmisches kleines Wesen, das die zarten Blätter des Baumes über alles liebte. Solange Musik erklang, wagte es sich nicht in die Nähe. Doch wenn der Garten drei ganze Tage lang still blieb, schlich es auf Zehenspitzen hervor und stahl fünf Blätter für ein köstliches Festmahl. Hielt die Stille an, kam es vielleicht drei Tage später wieder!',
      'Während der Ferien beschützte ein sanfter Zauber den Garten, und selbst der kleine Dieb musste fernbleiben.',
      'Doch der Musikbaum verlor niemals seine Magie. Sobald die Musik zurückkehrte, regten sich seine Zweige vor Freude, bereit, erneut zu wachsen.',
      'Und wenn du ganz genau hinhörst, kannst du ihn vielleicht zwischen den Blättern flüstern hören:',
      '„Spiel mir eine Melodie, und ich lasse einen kleinen Traum für dich wachsen.“',
    ],
  },
  zh: {
    title: '音乐树的秘密',
    paragraphs: [
      '从前，在一个神奇的花园里，住着一棵小树。它最爱的，莫过于音乐。',
      '每当美妙的音乐在空气中响起，它的枝条就会轻轻起舞，一片小小的新叶也可能悄然舒展。有时，长时间的练习会带来一片新叶；有时，只要带着专注与用心，短短的练习也已经足够；还有时，一次奇妙的突破会让小树高兴得闪闪发光。',
      '日复一日，旋律回荡在花园里，小树变得越来越强壮，走过了五个神奇的成长阶段，每一个都比上一个更加美妙。',
      '可是，灌木丛里藏着一个调皮的小家伙，它最喜欢小树柔嫩的叶子。只要音乐响着，它就不敢靠近。可要是花园整整三天没有声音，它就会踮着脚尖溜出来，偷走五片叶子，美美地吃上一顿。要是寂静继续下去，三天后它还可能再来！',
      '假期里，一道温柔的魔法会保护花园，就连那个小偷也只能远远躲开。',
      '但音乐树从未失去魔力。每当音乐再次响起，它的枝条便会欢喜地摇动，准备重新生长。',
      '如果你听得非常非常仔细，也许会听见它在叶间轻声说：',
      '“为我弹一支旋律吧，我会为你种出一个小小的梦。”',
    ],
  },
}

const languageOptions: ReadonlyArray<{ value: StoryLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'zh', label: '中文' },
]

type MusicTreeStoryProps = {
  onClose: () => void
}

export function MusicTreeStory({ onClose }: MusicTreeStoryProps) {
  const [language, setLanguage] = useState<StoryLanguage>('en')
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const story = STORIES[language]

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? [])
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="story-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="story-dialog" role="dialog" aria-modal="true" aria-labelledby="music-tree-story-title">
        <div className="story-dialog-header">
          <span className="story-book-icon" aria-hidden="true">📖</span>
          <h2 id="music-tree-story-title" lang={language === 'zh' ? 'zh-Hans' : language}>{story.title}</h2>
          <button ref={closeRef} type="button" className="story-close-button" onClick={onClose} aria-label="Close story">×</button>
        </div>
        <div className="story-language-selector" role="group" aria-label="Story language">
          {languageOptions.map((option) => (
            <button key={option.value} type="button" lang={option.value === 'zh' ? 'zh-Hans' : option.value} className={language === option.value ? 'active' : ''} aria-pressed={language === option.value} onClick={() => setLanguage(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div key={language} className="story-scroll" role="region" aria-labelledby="music-tree-story-title" tabIndex={0} lang={language === 'zh' ? 'zh-Hans' : language}>
          {story.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </section>
    </div>
  )
}
