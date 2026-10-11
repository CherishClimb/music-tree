export function TodayPracticeCard({ practised, minutes, water, health, visibleLeaves }: { practised: boolean; minutes: number; water: number; health: number; visibleLeaves: number }) {
  const leafSummary = `${visibleLeaves} ${visibleLeaves === 1 ? 'leaf' : 'leaves'}`
  return <section className="child-card compact-child-card"><span className="child-card-icon" aria-hidden="true">{practised ? '✦' : '○'}</span><div><p className="child-kicker">Today</p><h2>{practised ? 'Your music is caring for the tree!' : 'Your tree is ready for music'}</h2><p>{practised ? `${minutes} minutes today. Water ${water}/3 · Health ${health}% · ${leafSummary}.` : `Water 0/3 · Health ${health}% · ${leafSummary}. A little music can add a gentle glow.`}</p></div></section>
}
