import { PARCHMENT } from '../../../art/textures'
import { ANSWER_SHAPES } from './answers'

const NUMERALS = ['I', 'II', 'III', 'IV']

/**
 * An answer as a playing card: lacquered in the answer's colour, gold frame,
 * shape crest (colour-blind safe) and a parchment window for the text.
 */
export function AnswerCard({ index, text, className = '' }: { index: number; text: string; className?: string }) {
  return (
    <div className={`eh-card eh-c${index} ${className}`}>
      <span className="eh-card-num">{NUMERALS[index]}</span>
      <span className="eh-crest">
        <span>{ANSWER_SHAPES[index]}</span>
      </span>
      <span className="eh-card-panel" style={{ backgroundImage: PARCHMENT }}>
        <span className="eh-card-text">{text}</span>
      </span>
      <span className="eh-corner tr" />
      <span className="eh-corner bl" />
      <span className="eh-corner br" />
    </div>
  )
}
