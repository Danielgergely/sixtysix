import type { FastifyInstance } from 'fastify'

/**
 * The breakdown on the thank-you sheet: the donation link redirects back with
 * the Checkout Session id, and we ask Stripe what was paid and what the fee was.
 * STRIPE_KEY is a restricted key with read access to Checkout Sessions,
 * PaymentIntents, Charges and Balance transactions. Without it the app shows
 * the thank-you text alone.
 */
const STRIPE_KEY = process.env.STRIPE_KEY ?? ''
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/

interface Session {
  amount_total: number | null
  currency: string
  payment_status: string
  payment_intent?: { latest_charge?: { balance_transaction?: { amount: number; fee: number; net: number } | null } | null } | null
}

/** Amounts in the donor's currency, smallest unit. Compassion gets half of what is left after Stripe's fee. */
export function breakdown(s: Session) {
  const bt = s.payment_intent?.latest_charge?.balance_transaction
  if (s.payment_status !== 'paid' || !s.amount_total || !bt?.amount) return null
  // The fee is in the account's currency; scale it to the donor's (CHF → CHF is 1:1, HUF is converted).
  const rate = s.amount_total / bt.amount
  const fee = Math.round(bt.fee * rate)
  return { currency: s.currency, amount: s.amount_total, fee, compassion: Math.floor((s.amount_total - fee) / 2) }
}

export function registerDonationRoutes(app: FastifyInstance) {
  app.get('/api/donation', async (req) => {
    const id = ((req.query ?? {}) as Record<string, unknown>).session
    if (!STRIPE_KEY || typeof id !== 'string' || !SESSION_ID.test(id)) return { ok: false }
    try {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}?expand[]=payment_intent.latest_charge.balance_transaction`, {
        headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      })
      if (!res.ok) return { ok: false }
      const result = breakdown((await res.json()) as Session)
      return result ? { ok: true, ...result } : { ok: false }
    } catch {
      return { ok: false }
    }
  })
}
