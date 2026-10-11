# Music Tree creatures — Phase 1

The approved sheet is preserved in reference/approved-creature-sheet.png. The original creatures.png is untouched.

App assets are the six standalone SVGs in current/, with permanent species filenames:
bellwing-bird.svg, tempo-squirrel.svg, melody-moth.svg, chordling.svg, humming-bunny.svg, rhythm-sprite.svg.

These SVGs follow the approved sheet's silhouettes, icy pastel palette and musical details.
Chordling has a three-note chord motif; Rhythm Sprite has an explicit beat trail.
React imports these exact files through Vite, so deployment does not depend on untracked files.
Idle motion lives in src/components/creatures/creatures.css and respects reduced motion.
