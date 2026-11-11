import { db } from '@/lib/db'

// Hour thresholds and what they unlock. A tunable code constant, not a
// table — adjust the numbers here as shop policy changes.
export const REWARD_TIERS = [
  { id: 'free_membership', hours: 10, label: 'Free Annual Membership' },
  { id: 'earn_a_bike', hours: 30, label: 'Earn-a-Bike Eligibility' },
] as const

export type RewardTierId = (typeof REWARD_TIERS)[number]['id']

export type RewardRedemption = {
  id: number
  person_id: number
  tier_id: string
  redeemed_at: string
  logged_by: string | null
}

export type RewardStatus = {
  tier: (typeof REWARD_TIERS)[number]
  status: 'locked' | 'available' | 'redeemed'
  redemption: RewardRedemption | null
}

export function getRedemptionsForPerson(personId: number): Promise<RewardRedemption[]> {
  return db.all<RewardRedemption>('SELECT * FROM reward_redemptions WHERE person_id = ?', personId)
}

export async function getRewardStatuses(personId: number, volunteerHours: number): Promise<RewardStatus[]> {
  const redemptions = await getRedemptionsForPerson(personId)
  return REWARD_TIERS.map((tier) => {
    const redemption = redemptions.find((r) => r.tier_id === tier.id) ?? null
    const status = redemption ? 'redeemed' : volunteerHours >= tier.hours ? 'available' : 'locked'
    return { tier, status, redemption }
  })
}

export async function redeemReward(input: {
  personId: number
  tierId: RewardTierId
  loggedBy: string | null
}): Promise<void> {
  await db.run(
    'INSERT INTO reward_redemptions (person_id, tier_id, logged_by) VALUES (?, ?, ?)',
    input.personId,
    input.tierId,
    input.loggedBy
  )
}
