// Measured per painted figure (app/public/art/body-*.webp, from art-pipeline): image aspect
// (w/h) and where the crown sits: x/y = top-centre of the head, w = crown
// width, all in % of the figure image.
export type Pose = 'stand' | 'cheer'
interface Art {
  aspect: number
  head: { x: number; y: number; w: number }
}

export const BODY_ART: Record<string, Record<Pose, Art>> = {
  david: { stand: { aspect: 0.592, head: { x: 32.5, y: 4, w: 30 } }, cheer: { aspect: 0.732, head: { x: 46, y: 5, w: 26 } } },
  moses: { stand: { aspect: 0.651, head: { x: 40, y: 4, w: 26 } }, cheer: { aspect: 0.759, head: { x: 48, y: 13, w: 22 } } },
  esther: { stand: { aspect: 0.747, head: { x: 50.5, y: 12, w: 18 } }, cheer: { aspect: 0.69, head: { x: 45, y: 12, w: 19 } } },
  ruth: { stand: { aspect: 0.532, head: { x: 32, y: 15, w: 24 } }, cheer: { aspect: 0.747, head: { x: 50.5, y: 21.5, w: 16 } } },
}
