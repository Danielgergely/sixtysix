import { PARCHMENT } from '../../../art/textures'
import { ANSWER_SHAPES } from './answers'

const NUMERALS = ['I', 'II', 'III', 'IV']

/**
 * An answer as a playing card: lacquered in the answer's colour, gold frame,
 * shape crest (colour-blind safe) and a parchment window for the text.
 */
export function AnswerCard({ index, text, className = '' }: { index: number; text: string; className?: string }) {
  // Size caps (see .eh-fit): the longest word must fit the width ("Jephthah", "Heuschrecken"), and the
  // whole answer the panel's area ("Zum Thron des Königs"), so text shrinks instead of spilling out.
  const longest = Math.max(1, ...text.split(/\s+/).map((w) => w.length))
  const spread = Math.sqrt(Math.max(1, text.length)) / 0.79
  return (
    <div className={`eh-card eh-c${index} ${className}`}>
      <span className="eh-card-num">{NUMERALS[index]}</span>
      <span className="eh-crest">
        <span>{ANSWER_SHAPES[index]}</span>
      </span>
      <span className="eh-card-panel" style={{ backgroundImage: PARCHMENT }}>
        <span className="eh-card-text">
          <span className={`eh-fit ${longest > 9 ? 'long' : ''}`} style={{ '--w': longest, '--s': spread.toFixed(2) } as React.CSSProperties}>
            {longest > 9 ? text.split(/(\s+)/).map((w, i) => (w.length > 9 ? <span key={i} className="eh-hy">{w}</span> : w)) : text}
          </span>
        </span>
      </span>
      <span className="eh-corner c-tr" />
      <span className="eh-corner c-bl" />
      <span className="eh-corner c-br" />
    </div>
  )
}
