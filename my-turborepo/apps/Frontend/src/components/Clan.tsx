import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from './AuthModal'
import {
  acceptClanJoinRequest,
  createClan,
  updateClan,
  disburseClanFunds,
  donateToClan,
  fetchClans,
  fetchClanLeaderboards,
  fetchMyClan,
  disbandClan,
  kickClanMember,
  leaveClan,
  rejectClanJoinRequest,
  transferClanLeadership,
  requestJoinClan,
  type ClanDisbursementRow,
  type ClanDonationRow,
  type ClanLeaderboardEntry,
  type ClanLeaderboardPayoutRow,
  type ClanPublic,
  type MyClanResponse,
} from '../authApi'
import { getPvpTierFromElo, PvPTierBadge } from './PvPTierBadge.tsx'
import { PageHeader, PageShell, PageTabBar } from './PageLayout.tsx'
import { isAccountVerified } from './VerifiedAccountBadge.tsx'

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtClanDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function clanTotalEloHint(): string {
  return "Sum of each member's best singles or doubles rating. Not on the ladder yet? That counts as 1,000 ELO per member."
}

function pct(current: number, target: number): number {
  if (target <= 0) return 100
  return Math.min(100, Math.max(0, (current / target) * 100))
}

function ClanLeaderDisplay({ username, compact = false }: { username: string; compact?: boolean }) {
  return (
    <div className={`clan-leader-display${compact ? ' clan-leader-display--compact' : ''}`}>
      <span className="clan-leader-badge">Leader</span>
      <span className="clan-leader-name" title={username}>
        {username}
      </span>
    </div>
  )
}

function ClanRoleBadge({
  role,
  highlightYou = false,
}: {
  role: string
  highlightYou?: boolean
}) {
  if (role === 'leader') {
    return <span className="clan-role-badge clan-role-badge--leader">Clan leader</span>
  }
  return (
    <span className={`clan-role-badge clan-role-badge--member${highlightYou ? ' clan-role-badge--you' : ''}`}>
      {highlightYou ? 'You · Member' : 'Member'}
    </span>
  )
}

function ClanProgressBar({ value, complete }: { value: number; complete?: boolean }) {
  return (
    <span className="clan-progress" aria-hidden>
      <span
        className={`clan-progress-fill${complete ? ' clan-progress-fill--complete' : ''}`}
        style={{ width: `${complete ? 100 : value}%` }}
      />
    </span>
  )
}

function ClanLevelProgress({ clan }: { clan: ClanPublic }) {
  const pctInLevel =
    clan.xp_per_level > 0 ? Math.min(100, Math.max(0, (clan.xp_in_level / clan.xp_per_level) * 100)) : 0

  return (
    <div className="clan-milestones clan-level-progress">
      <h3 className="clan-section-title">Clan level</h3>
      <p className="clan-section-hint">
        Members earn clan XP when they claim their daily login reward — 50 XP base, +10 XP per streak day (up to 110 XP
        on day 7). Every {fmt(clan.xp_per_level)} XP levels up the clan.
      </p>
      <ul className="clan-milestone-list">
        <li className="clan-milestone-item">
          <div className="clan-milestone-head">
            <span className="clan-milestone-label">Level {clan.level}</span>
            <span className="clan-milestone-pct">{Math.round(pctInLevel)}%</span>
          </div>
          <ClanProgressBar value={pctInLevel} />
          <p className="clan-milestone-detail">
            {fmt(clan.xp_in_level)} / {fmt(clan.xp_per_level)} XP to level {clan.level + 1} · {fmt(clan.xp)} XP total
          </p>
        </li>
      </ul>
    </div>
  )
}

function ClanMilestones({ clan }: { clan: ClanPublic }) {
  const treasury = clan.bank_balance
  const memberSlotPct =
    clan.max_members >= 5
      ? 100
      : pct(treasury % clan.treasury_milestone, clan.treasury_milestone)

  const milestones = [
    {
      key: 'members',
      label: 'Member slots',
      detail:
        clan.max_members >= 5
          ? `Max ${clan.max_members} members unlocked`
          : clan.next_member_unlock_treasury != null
            ? `${fmt(clan.next_member_unlock_treasury)} AsterynPoints treasury to next slot (${clan.max_members}/${5})`
            : `${clan.max_members} / 5 slots`,
      pct: memberSlotPct,
      complete: clan.max_members >= 5,
    },
    ...clan.treasury_milestones.map((m) => ({
      key: m.key,
      label: m.label,
      detail: `${fmt(treasury)} / ${fmt(m.threshold)} AsterynPoints in treasury`,
      pct: pct(treasury, m.threshold),
      complete: treasury >= m.threshold,
    })),
  ]

  return (
    <div className="clan-milestones">
      <h3 className="clan-section-title">Treasury milestones</h3>
      <p className="clan-section-hint">
        Milestones use the current treasury balance — donations add to it; leader payouts reduce it. Every{' '}
        {fmt(clan.treasury_milestone)} AsterynPoints in treasury adds +1 member slot (up to 5).
      </p>
      <ul className="clan-milestone-list">
        {milestones.map((m) => (
          <li key={m.key} className="clan-milestone-item">
            <div className="clan-milestone-head">
              <span className="clan-milestone-label">{m.label}</span>
              {m.complete ? (
                <span className="clan-milestone-badge">Unlocked</span>
              ) : (
                <span className="clan-milestone-pct">{Math.round(m.pct)}%</span>
              )}
            </div>
            <ClanProgressBar value={m.pct} complete={m.complete} />
            <p className="clan-milestone-detail">{m.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function clanLbCategoryLabel(category: 'top_treasury' | 'top_average_elo' | 'top_level' | 'top_donated'): string {
  if (category === 'top_treasury' || category === 'top_donated') return 'Top treasury'
  if (category === 'top_level') return 'Top level'
  return 'Total ELO'
}

function clanLbDailyRewardAmount(rank: number | null, top1: number, top2: number): number | null {
  if (rank === 1) return top1
  if (rank === 2) return top2
  return null
}

function ClanTreasuryActivity({
  donations,
  disbursements,
}: {
  donations: ClanDonationRow[]
  disbursements: ClanDisbursementRow[]
}) {
  if (donations.length === 0 && disbursements.length === 0) return null

  return (
    <div className="clan-treasury-history">
      <h3 className="clan-section-title">Treasury activity</h3>
      <p className="clan-section-hint">
        Recent donations into the treasury and leader payouts to members (last 20 each).
      </p>

      {donations.length > 0 ? (
        <div className="clan-treasury-history-block">
          <h4 className="clan-treasury-history-title">Donations</h4>
          <ul className="clan-treasury-history-list">
            {donations.map((d) => (
              <li key={d.id} className="clan-treasury-history-row">
                <span className="clan-treasury-history-when">{fmtClanDt(d.created_at)}</span>
                <span className="clan-treasury-history-who">
                  <strong>{d.username}</strong> donated
                </span>
                <span className="clan-treasury-history-amount clan-treasury-history-amount--in">
                  +{fmt(d.amount)} AsterynPoints
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {disbursements.length > 0 ? (
        <div className="clan-treasury-history-block">
          <h4 className="clan-treasury-history-title">Treasury distributions</h4>
          <ul className="clan-treasury-history-list">
            {disbursements.map((d) => (
              <li key={d.id} className="clan-treasury-history-row">
                <span className="clan-treasury-history-when">{fmtClanDt(d.created_at)}</span>
                <span className="clan-treasury-history-who">
                  <strong>{d.leader_username}</strong> → <strong>{d.recipient_username}</strong>
                </span>
                <span className="clan-treasury-history-amount clan-treasury-history-amount--out">
                  {fmt(d.amount)} AsterynPoints
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function ClanLeaderboardRewardsPanel({
  rewardTop1,
  rewardTop2,
  ranks,
  dailyBonus,
  recentPayouts,
}: {
  rewardTop1: number
  rewardTop2: number
  ranks: { top_treasury: number | null; top_total_elo: number | null; top_level: number | null }
  dailyBonus: number
  recentPayouts: ClanLeaderboardPayoutRow[]
}) {
  const rewardSlots = [
    { label: 'Top treasury', rank: ranks.top_treasury },
    { label: 'Total ELO', rank: ranks.top_total_elo },
    { label: 'Top level', rank: ranks.top_level },
  ]
  const earningReward = rewardSlots.some((s) => s.rank === 1 || s.rank === 2)

  return (
    <div className={`clan-lb-rewards${earningReward ? ' clan-lb-rewards--active' : ''}`}>
      <h3 className="clan-section-title">Leaderboard daily rewards</h3>
      <p className="clan-section-hint">
        #1 on each board earns {fmt(rewardTop1)} AsterynPoints/day in treasury; #2 earns {fmt(rewardTop2)} AsterynPoints/day — paid at 00:00
        Asia/Ho_Chi_Minh (same schedule as member daily income).
      </p>
      <div className="clan-lb-rewards-grid">
        {rewardSlots.map((slot) => {
          const payout = clanLbDailyRewardAmount(slot.rank, rewardTop1, rewardTop2)
          return (
            <div key={slot.label} className="clan-lb-reward-slot">
              <span className="clan-lb-reward-slot-label">{slot.label}</span>
              <span className="clan-lb-reward-slot-rank">{slot.rank != null ? `#${slot.rank}` : '—'}</span>
              {payout != null ? (
                <span className="clan-lb-reward-slot-badge">+{fmt(payout)} AsterynPoints/day</span>
              ) : (
                <span className="clan-lb-reward-slot-hint">
                  #1 +{fmt(rewardTop1)} · #2 +{fmt(rewardTop2)} AsterynPoints/day
                </span>
              )}
            </div>
          )
        })}
      </div>
      {dailyBonus > 0 ? (
        <p className="clan-lb-rewards-total">
          Your clan earns an extra <strong>+{fmt(dailyBonus)} AsterynPoints/day</strong> in treasury from leaderboard placement.
        </p>
      ) : null}
      {recentPayouts.length > 0 ? (
        <div className="clan-lb-rewards-history">
          <h4 className="clan-lb-rewards-history-title">Recent treasury credits</h4>
          <ul className="clan-lb-rewards-history-list">
            {recentPayouts.map((p) => (
              <li key={`${p.payout_date}-${p.category}-${p.rank_position ?? 1}`} className="clan-lb-rewards-history-row">
                <span className="clan-lb-rewards-history-date">{p.payout_date}</span>
                <span className="clan-lb-rewards-history-cat">
                  {clanLbCategoryLabel(p.category)}
                  {p.rank_position ? ` #${p.rank_position}` : ''}
                </span>
                <span className="clan-lb-rewards-history-amount">+{fmt(p.amount)} AsterynPoints</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function ClanLeaderboardTable({
  title,
  hint,
  rows,
  valueKey,
  valueLabel,
  rewardTop1,
  rewardTop2,
  showTitle = true,
}: {
  title: string
  hint?: string
  rows: ClanLeaderboardEntry[]
  valueKey: 'bank_balance' | 'total_elo' | 'level'
  valueLabel: string
  rewardTop1?: number
  rewardTop2?: number
  showTitle?: boolean
}) {
  return (
    <div className="clan-lb-panel">
      {showTitle ? <h3 className="clan-section-title">{title}</h3> : null}
      {hint ? <p className="clan-section-hint">{hint}</p> : null}
      {rows.length === 0 ? (
        <p className="clan-empty clan-empty--compact">No clans yet.</p>
      ) : (
        <ol className="clan-lb-list">
          {rows.map((row) => {
            const rewardAmount = clanLbDailyRewardAmount(row.rank, rewardTop1 ?? 0, rewardTop2 ?? 0)
            const rowClass =
              row.rank === 1 && rewardTop1
                ? ' clan-lb-row--top1'
                : row.rank === 2 && rewardTop2
                  ? ' clan-lb-row--top2'
                  : ''
            return (
              <li key={`${valueKey}-${row.id}`} className={`clan-lb-row${rowClass}`}>
                <span className="clan-lb-rank">#{row.rank}</span>
                <img src={row.avatar_url} alt="" className="clan-lb-avatar" />
                <span className="clan-lb-name">{row.name}</span>
                {rewardAmount != null ? (
                  <span
                    className={`clan-lb-reward-pill${row.rank === 2 ? ' clan-lb-reward-pill--top2' : ''}`}
                  >
                    +{fmt(rewardAmount)} AsterynPoints/day
                  </span>
                ) : null}
                <div className="clan-lb-metric">
                  {valueKey === 'total_elo' && row.total_elo != null ? (
                    <>
                      <span className="clan-lb-metric-main">
                        <span className="clan-lb-metric-num">{fmt(row.total_elo)}</span>
                      </span>
                      <span className="clan-lb-metric-label">{valueLabel}</span>
                    </>
                  ) : valueKey === 'level' ? (
                    <>
                      <span className="clan-lb-metric-main">
                        <span className="clan-lb-metric-num">Lv. {row.level}</span>
                      </span>
                      <span className="clan-lb-metric-label">{fmt(row.xp)} XP</span>
                    </>
                  ) : (
                    <>
                      <span className="clan-lb-metric-main">
                        <span className="clan-lb-metric-num">{fmt(row.bank_balance)}</span>
                        <span className="clan-lb-metric-suffix">AsterynPoints</span>
                      </span>
                      <span className="clan-lb-metric-label">{valueLabel}</span>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function incomeBonusLabel(multiplier: number): string | null {
  if (multiplier <= 1) return null
  return `+${Math.round((multiplier - 1) * 100)}% daily income`
}

function ClanCard({
  clan,
  canJoin,
  joinPending,
  joinBusy,
  joinHint,
  onJoin,
}: {
  clan: ClanPublic
  canJoin: boolean
  joinPending: boolean
  joinBusy: boolean
  joinHint: string | null
  onJoin: () => void
}) {
  const isFull = clan.member_count >= clan.max_members
  const incomeBonus = incomeBonusLabel(clan.daily_income_multiplier)
  const nextMilestone = (clan.treasury_milestones ?? []).find((m) => clan.bank_balance < m.threshold)
  const nextMilestonePct = nextMilestone ? pct(clan.bank_balance, nextMilestone.threshold) : 100

  return (
    <article className="clan-card">
      <img src={clan.avatar_url} alt="" className="clan-card-avatar" />
      <div className="clan-card-body">
        <div className="clan-card-header">
          <div className="clan-card-title-block">
            <h3 className="clan-card-name">
              {clan.name}
              <span className="clan-card-level">Lv. {clan.level}</span>
            </h3>
            <ClanLeaderDisplay username={clan.leader_username} compact />
          </div>
          <div className="clan-card-aside">
            <span className="clan-card-members">
              {clan.member_count} / {clan.max_members}
            </span>
            <span className="clan-card-members-label">members</span>
            {canJoin ? (
              <div className="clan-card-actions">
                {joinPending ? (
                  <span className="clan-card-action-hint">Join request pending</span>
                ) : isFull ? (
                  <span className="clan-card-action-hint">Clan full</span>
                ) : (
                  <button
                    type="button"
                    disabled={joinBusy}
                    onClick={onJoin}
                    className="clan-btn clan-btn-primary clan-btn-sm"
                  >
                    {joinBusy ? 'Sending…' : 'Request to join'}
                  </button>
                )}
              </div>
            ) : joinHint ? (
              <span className="clan-card-action-hint">{joinHint}</span>
            ) : null}
          </div>
        </div>

        <div className="clan-card-stat-grid">
          <div className="clan-card-stat clan-card-stat--treasury">
            <span className="clan-card-stat-label">Treasury</span>
            <span className="clan-card-stat-value">{fmt(clan.bank_balance)} AsterynPoints</span>
          </div>
          <div className="clan-card-stat">
            <span className="clan-card-stat-label">Daily income</span>
            <span className="clan-card-stat-value">+{fmt(clan.daily_income_per_day)} AsterynPoints</span>
          </div>
          {clan.total_elo != null ? (
            <div className="clan-card-stat clan-card-stat--elo">
              <span className="clan-card-stat-label">Total ELO</span>
              <span className="clan-card-stat-value">{fmt(clan.total_elo)}</span>
            </div>
          ) : null}
        </div>

        {(incomeBonus || clan.daily_ticket_bonus > 0) && (
          <div className="clan-card-perks">
            {incomeBonus ? <span className="clan-card-perk">{incomeBonus}</span> : null}
            {clan.daily_ticket_bonus > 0 ? (
              <span className="clan-card-perk">
                +{clan.daily_ticket_bonus} ticket{clan.daily_ticket_bonus > 1 ? 's' : ''}/member/day
              </span>
            ) : null}
          </div>
        )}

        {nextMilestone ? (
          <div className="clan-card-next-milestone">
            <div className="clan-card-next-milestone-head">
              <span className="clan-card-next-milestone-label">Next: {nextMilestone.label}</span>
              <span className="clan-card-next-milestone-pct">{Math.round(nextMilestonePct)}%</span>
            </div>
            <ClanProgressBar value={nextMilestonePct} complete={false} />
            <p className="clan-card-next-milestone-detail">
              {fmt(clan.bank_balance)} / {fmt(nextMilestone.threshold)} AsterynPoints in treasury
            </p>
          </div>
        ) : null}

        {clan.bio ? <p className="clan-card-bio">{clan.bio}</p> : null}
      </div>
    </article>
  )
}

function formatRejoinWait(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'soon'
  const totalMinutes = Math.ceil(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function ClanLeaveConfirmModal({
  clanName,
  busy,
  onCancel,
  onConfirm,
}: {
  clanName: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="clan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-leave-title"
      onClick={onCancel}
    >
      <div className="clan-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="clan-leave-title" className="clan-modal-title">
          Leave {clanName}?
        </h3>
        <p className="clan-modal-body">
          You will leave this clan immediately. You must wait <strong>24 hours</strong> before you can request to join
          another clan.
        </p>
        <div className="clan-modal-actions">
          <button type="button" className="clan-btn clan-btn-ghost" disabled={busy} onClick={onCancel}>
            Stay in clan
          </button>
          <button type="button" className="clan-btn clan-btn-leave" disabled={busy} onClick={onConfirm}>
            {busy ? 'Leaving…' : 'Leave clan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClanKickConfirmModal({
  username,
  busy,
  onCancel,
  onConfirm,
}: {
  username: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="clan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-kick-title"
      onClick={onCancel}
    >
      <div className="clan-modal clan-modal--danger" onClick={(e) => e.stopPropagation()}>
        <h3 id="clan-kick-title" className="clan-modal-title">
          Remove {username}?
        </h3>
        <p className="clan-modal-body">
          They will be removed from the clan immediately and must wait <strong>24 hours</strong> before joining another
          clan.
        </p>
        <div className="clan-modal-actions">
          <button type="button" className="clan-btn clan-btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="clan-btn clan-btn-kick" disabled={busy} onClick={onConfirm}>
            {busy ? 'Removing…' : 'Remove member'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClanTransferLeaderModal({
  username,
  clanName,
  busy,
  onCancel,
  onConfirm,
}: {
  username: string
  clanName: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="clan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-transfer-title"
      onClick={onCancel}
    >
      <div className="clan-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="clan-transfer-title" className="clan-modal-title">
          Make {username} leader?
        </h3>
        <p className="clan-modal-body">
          <strong>{username}</strong> will become leader of {clanName}. You will become a regular member and lose access
          to treasury payouts, join requests, and clan settings.
        </p>
        <div className="clan-modal-actions">
          <button type="button" className="clan-btn clan-btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="clan-btn clan-btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Transferring…' : 'Transfer leadership'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClanDisbandConfirmModal({
  clanName,
  memberCount,
  treasuryBalance,
  busy,
  onCancel,
  onConfirm,
}: {
  clanName: string
  memberCount: number
  treasuryBalance: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="clan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-disband-title"
      onClick={onCancel}
    >
      <div className="clan-modal clan-modal--danger" onClick={(e) => e.stopPropagation()}>
        <h3 id="clan-disband-title" className="clan-modal-title">
          Disband {clanName}?
        </h3>
        <p className="clan-modal-body">
          This permanently deletes the clan. This cannot be undone.
        </p>
        <ul className="clan-modal-list">
          <li>
            <strong>{memberCount}</strong> member{memberCount === 1 ? '' : 's'} will be removed
            {memberCount > 1 ? ' (other members get a 24-hour join cooldown)' : ''}
          </li>
          {treasuryBalance > 0 ? (
            <li>
              Treasury balance of <strong>{fmt(treasuryBalance)} AsterynPoints</strong> will be lost
            </li>
          ) : null}
          <li>Donation history and leaderboard placement for this clan are removed</li>
        </ul>
        <div className="clan-modal-actions">
          <button type="button" className="clan-btn clan-btn-ghost" disabled={busy} onClick={onCancel}>
            Keep clan
          </button>
          <button type="button" className="clan-btn clan-btn-disband" disabled={busy} onClick={onConfirm}>
            {busy ? 'Disbanding…' : 'Disband clan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClanTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`clan-tab${active ? ' clan-tab--active' : ''}`}
    >
      {children}
    </button>
  )
}

type ClanPageTab = 'browse' | 'leaderboard' | 'mine'
type ClanLbView = 'top_treasury' | 'top_total_elo' | 'top_level'

export function Clan() {
  const { isAuthenticated, user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [list, setList] = useState<ClanPublic[]>([])
  const [createCost, setCreateCost] = useState(500_000)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState<MyClanResponse | null>(null)
  const [mineLoading, setMineLoading] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createBio, setCreateBio] = useState('')
  const [createIcon, setCreateIcon] = useState<File | null>(null)
  const [createIconPreview, setCreateIconPreview] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [donateAmount, setDonateAmount] = useState('')
  const [donateBusy, setDonateBusy] = useState(false)
  const [donateError, setDonateError] = useState<string | null>(null)

  const [disburseUserId, setDisburseUserId] = useState('')
  const [disburseAmount, setDisburseAmount] = useState('')
  const [disburseBusy, setDisburseBusy] = useState(false)
  const [disburseError, setDisburseError] = useState<string | null>(null)

  const [joinBusyClanId, setJoinBusyClanId] = useState<number | null>(null)
  const [requestActionBusy, setRequestActionBusy] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [lbTreasury, setLbTreasury] = useState<ClanLeaderboardEntry[]>([])
  const [lbTotalElo, setLbTotalElo] = useState<ClanLeaderboardEntry[]>([])
  const [lbLevel, setLbLevel] = useState<ClanLeaderboardEntry[]>([])
  const [lbRewardTop1, setLbRewardTop1] = useState(100_000)
  const [lbRewardTop2, setLbRewardTop2] = useState(50_000)
  const [lbLoading, setLbLoading] = useState(true)
  const [lbView, setLbView] = useState<ClanLbView>('top_treasury')
  const [activeTab, setActiveTab] = useState<ClanPageTab>('browse')
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [showDisbandConfirm, setShowDisbandConfirm] = useState(false)
  const [disbandBusy, setDisbandBusy] = useState(false)
  const [kickTarget, setKickTarget] = useState<{ user_id: number; username: string } | null>(null)
  const [kickBusy, setKickBusy] = useState(false)
  const [transferTarget, setTransferTarget] = useState<{ user_id: number; username: string } | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)

  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editIcon, setEditIcon] = useState<File | null>(null)
  const [editIconPreview, setEditIconPreview] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!createIcon) {
      setCreateIconPreview(null)
      return
    }
    const url = URL.createObjectURL(createIcon)
    setCreateIconPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [createIcon])

  useEffect(() => {
    if (!editIcon) {
      setEditIconPreview(null)
      return
    }
    const url = URL.createObjectURL(editIcon)
    setEditIconPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [editIcon])

  const loadLeaderboards = useCallback(() => {
    setLbLoading(true)
    fetchClanLeaderboards({ limit: 10 })
      .then(({ top_treasury, top_total_elo, top_level, rewards }) => {
        setLbTreasury(top_treasury ?? [])
        setLbTotalElo(top_total_elo ?? [])
        setLbLevel(top_level ?? [])
        if (rewards?.top1_per_category) setLbRewardTop1(rewards.top1_per_category)
        if (rewards?.top2_per_category) setLbRewardTop2(rewards.top2_per_category)
      })
      .catch(() => {
        setLbTreasury([])
        setLbTotalElo([])
        setLbLevel([])
      })
      .finally(() => setLbLoading(false))
  }, [])

  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    fetchClans({ q: search.trim(), limit: 100 })
      .then(({ rows, create_cost }) => {
        setList(rows)
        if (create_cost) setCreateCost(create_cost)
      })
      .catch((e) => setListError(e instanceof Error ? e.message : 'Failed to load clans'))
      .finally(() => setListLoading(false))
  }, [search])

  const loadMine = useCallback(() => {
    if (!isAuthenticated) {
      setMine(null)
      return
    }
    setMineLoading(true)
    fetchMyClan()
      .then(setMine)
      .catch(() => setMine(null))
      .finally(() => setMineLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    loadLeaderboards()
  }, [loadLeaderboards])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadMine()
  }, [loadMine])

  const myClan = mine?.clan ?? null
  const isLeader = myClan?.my_role === 'leader'

  useEffect(() => {
    if (!myClan || !isLeader) return
    setEditName(myClan.name)
    setEditBio(myClan.bio ?? '')
    setEditIcon(null)
    setEditError(null)
  }, [myClan?.id, myClan?.name, myClan?.bio, isLeader])
  const pendingJoinClanIds = useMemo(
    () => new Set((mine?.my_pending_join_requests ?? []).map((r) => r.clan_id)),
    [mine?.my_pending_join_requests]
  )

  const disburseCandidates = useMemo(() => myClan?.members ?? [], [myClan])

  const topDonorsInClan = useMemo(
    () => (myClan ? [...myClan.members].sort((a, b) => b.donated_total - a.donated_total).slice(0, 5) : []),
    [myClan]
  )

  const rejoinAvailableAt = mine?.rejoin_available_at ?? null
  const inRejoinCooldown =
    rejoinAvailableAt != null && new Date(rejoinAvailableAt).getTime() > Date.now()
  const isVerified = Boolean(user?.is_admin) || isAccountVerified(user)
  const canRequestJoin = isAuthenticated && isVerified && !myClan && !inRejoinCooldown

  const getClanJoinHint = (clan: ClanPublic): string | null => {
    if (!isAuthenticated) return null
    if (myClan) return myClan.id === clan.id ? 'Your clan' : 'Already in a clan'
    if (!isVerified) return 'Verification required'
    if (inRejoinCooldown && rejoinAvailableAt) {
      return `Rejoin in ${formatRejoinWait(rejoinAvailableAt)}`
    }
    return null
  }

  const handleDisbandClan = async () => {
    setDisbandBusy(true)
    try {
      await disbandClan()
      setShowDisbandConfirm(false)
      setMine(null)
      setActionMsg('Clan disbanded.')
      setActiveTab('mine')
      loadList()
      loadLeaderboards()
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Disband failed')
    } finally {
      setDisbandBusy(false)
    }
  }

  const handleKickMember = async () => {
    if (!myClan || !kickTarget) return
    setKickBusy(true)
    try {
      await kickClanMember(myClan.id, kickTarget.username)
      setKickTarget(null)
      setActionMsg(`Removed ${kickTarget.username} from the clan.`)
      loadMine()
      loadList()
      loadLeaderboards()
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Remove member failed')
    } finally {
      setKickBusy(false)
    }
  }

  const handleTransferLeadership = async () => {
    if (!myClan || !transferTarget) return
    setTransferBusy(true)
    try {
      const { new_leader_username } = await transferClanLeadership(myClan.id, transferTarget.username)
      setTransferTarget(null)
      setActionMsg(`${new_leader_username} is now clan leader.`)
      loadMine()
      loadList()
      loadLeaderboards()
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Transfer failed')
    } finally {
      setTransferBusy(false)
    }
  }

  const handleLeaveClan = async () => {
    setLeaveBusy(true)
    try {
      await leaveClan()
      setShowLeaveConfirm(false)
      setActionMsg('Left clan. You can join another clan in 24 hours.')
      setActiveTab('mine')
      loadMine()
      loadList()
      loadLeaderboards()
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Leave failed')
    } finally {
      setLeaveBusy(false)
    }
  }

  const handleUpdateClan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myClan || !isLeader) return
    const name = editName.trim()
    if (name.length < 2 || name.length > 32) {
      setEditError('Clan name must be 2–32 characters.')
      return
    }
    const nameUnchanged = name === myClan.name
    const bioUnchanged = editBio.trim() === (myClan.bio ?? '').trim()
    if (nameUnchanged && bioUnchanged && !editIcon) {
      setEditError('Change the name, bio, or icon before saving.')
      return
    }
    setEditBusy(true)
    setEditError(null)
    try {
      const fd = new FormData()
      fd.set('name', name)
      fd.set('bio', editBio.trim())
      if (editIcon) fd.set('avatar', editIcon)
      const { clan } = await updateClan(myClan.id, fd)
      setMine((prev) => (prev ? { ...prev, clan } : prev))
      setEditIcon(null)
      setActionMsg('Clan profile updated.')
      loadList()
      loadLeaderboards()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditBusy(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) {
      setShowAuth(true)
      return
    }
    if (!createIcon) {
      setCreateError('Choose a clan icon.')
      return
    }
    setCreateBusy(true)
    setCreateError(null)
    try {
      const fd = new FormData()
      fd.set('name', createName.trim())
      fd.set('bio', createBio.trim())
      fd.set('avatar', createIcon)
      await createClan(fd)
      setCreateName('')
      setCreateBio('')
      setCreateIcon(null)
      setActionMsg('Clan created!')
      setActiveTab('mine')
      loadList()
      loadMine()
      loadLeaderboards()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreateBusy(false)
    }
  }

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myClan) return
    const amount = parseInt(donateAmount, 10)
    if (!Number.isInteger(amount) || amount < 1) {
      setDonateError('Enter a valid amount.')
      return
    }
    setDonateBusy(true)
    setDonateError(null)
    try {
      await donateToClan(myClan.id, amount)
      setDonateAmount('')
      setActionMsg('Donation added to clan treasury.')
      loadMine()
      loadList()
      loadLeaderboards()
    } catch (err) {
      setDonateError(err instanceof Error ? err.message : 'Donate failed')
    } finally {
      setDonateBusy(false)
    }
  }

  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myClan || !isLeader) return
    const amount = parseInt(disburseAmount, 10)
    const member = disburseCandidates.find((m) => String(m.user_id) === disburseUserId)
    if (!member) {
      setDisburseError('Choose a member.')
      return
    }
    if (!Number.isInteger(amount) || amount < 1) {
      setDisburseError('Enter a valid amount.')
      return
    }
    const remaining = myClan.treasury_daily_disburse_remaining
    if (remaining != null && amount > remaining) {
      setDisburseError(
        remaining <= 0
          ? `Daily payout limit reached (max ${fmt(myClan.treasury_daily_disburse_max ?? 3_000_000)} AsterynPoints per day). Resets at 00:00 Asia/Ho_Chi_Minh.`
          : `Amount exceeds today's remaining payout limit (${fmt(remaining)} AsterynPoints left today).`
      )
      return
    }
    setDisburseBusy(true)
    setDisburseError(null)
    try {
      await disburseClanFunds(myClan.id, member.username, amount)
      setDisburseAmount('')
      setDisburseUserId('')
      setActionMsg(`Sent ${fmt(amount)} AsterynPoints to ${member.username}.`)
      loadMine()
      loadLeaderboards()
    } catch (err) {
      setDisburseError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setDisburseBusy(false)
    }
  }

  const handleJoinRequest = (clanId: number) => {
    if (!isAuthenticated) {
      setShowAuth(true)
      return
    }
    if (!isVerified) {
      setActionMsg('Account verification is required to request joining a clan.')
      return
    }
    setJoinBusyClanId(clanId)
    requestJoinClan(clanId)
      .then(() => {
        setActionMsg('Join request sent! Wait for the leader to accept.')
        setActiveTab('mine')
        loadMine()
      })
      .catch((e) => setActionMsg(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setJoinBusyClanId(null))
  }

  const handleAcceptRequest = (requestId: number) => {
    setRequestActionBusy(requestId)
    acceptClanJoinRequest(requestId)
      .then(() => {
        setActionMsg('Player accepted into clan.')
        loadMine()
        loadList()
        loadLeaderboards()
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Accept failed'
        setActionMsg(msg)
        loadMine()
      })
      .finally(() => setRequestActionBusy(null))
  }

  const handleRejectRequest = (requestId: number) => {
    setRequestActionBusy(requestId)
    rejectClanJoinRequest(requestId)
      .then(() => {
        setActionMsg('Join request rejected.')
        loadMine()
      })
      .catch((e) => setActionMsg(e instanceof Error ? e.message : 'Reject failed'))
      .finally(() => setRequestActionBusy(null))
  }

  return (
    <PageShell max="6xl" className="clan-page !pb-12">
      <PageHeader
        accent="violet"
        eyebrow="Community"
        title="Clans"
        description="Pool Asteryn Point in a shared treasury, unlock perks as the balance grows, and compete on treasury and total ELO leaderboards."
      />

      {actionMsg ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-3 py-2.5 text-sm text-emerald-100/95"
        >
          <span>{actionMsg}</span>
          <button type="button" className="pixel-btn text-xs py-1 px-2 shrink-0" onClick={() => setActionMsg(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <PageTabBar
        ariaLabel="Clan sections"
        tabs={[
          { id: 'browse' as const, label: 'Browse clans' },
          { id: 'leaderboard' as const, label: 'Leaderboard' },
          { id: 'mine' as const, label: 'Your clan' },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'browse' && (
        <>
          <section className="clan-panel clan-panel--how">
            <h2 className="clan-section-title">How clans work</h2>
            <p className="clan-how-lead">
              Clans pool website Asteryn Point in a shared treasury. Donations add to the balance; leader payouts reduce it.
              Milestones and leaderboards use the current treasury — not a separate lifetime total.
            </p>
            <div className="clan-how-grid">
              <div className="clan-how-block">
                <h3 className="clan-how-block-title">Getting started</h3>
                <ul className="clan-how-list">
                  <li>
                    <strong>Create a clan</strong> — one-time fee of {fmt(createCost)} AsterynPoints from your website balance.
                  </li>
                  <li>
                    <strong>Join a clan</strong> — verified accounts can send a request; the leader approves new members.
                  </li>
                </ul>
              </div>
              <div className="clan-how-block">
                <h3 className="clan-how-block-title">Treasury &amp; donations</h3>
                <ul className="clan-how-list">
                  <li>Member donations add AsterynPoints to the clan <strong>treasury</strong>.</li>
                  <li>
                    Leader payouts reduce the treasury — milestones and member-slot unlocks follow the current balance.
                  </li>
                </ul>
              </div>
              <div className="clan-how-block">
                <h3 className="clan-how-block-title">Daily income &amp; rewards</h3>
                <ul className="clan-how-list">
                  <li>
                    <strong>{fmt(25_000)} AsterynPoints × members</strong> credited to treasury daily at 00:00 Asia/Ho_Chi_Minh.
                  </li>
                  <li>
                    <strong>#1 on each leaderboard</strong> earns {fmt(lbRewardTop1)} AsterynPoints/day; <strong>#2</strong> earns{' '}
                    {fmt(lbRewardTop2)} AsterynPoints/day (treasury, total ELO, and level) — paid into clan treasury at 00:00.
                  </li>
                </ul>
              </div>
              <div className="clan-how-block">
                <h3 className="clan-how-block-title">Membership</h3>
                <ul className="clan-how-list">
                  <li>Each daily login claim while in a clan earns <strong>50+ XP</strong> for the clan (more on streak days).</li>
                  <li>Leaders may distribute treasury funds, remove members, or transfer leadership.</li>
                  <li>After leaving a clan, a <strong>24-hour cooldown</strong> applies before you can join another.</li>
                  <li>
                    <strong>Account verification</strong> is required to request joining a clan (same as the website shop).
                  </li>
                </ul>
              </div>
              <div className="clan-how-block clan-how-block--wide">
                <h3 className="clan-how-block-title">Clan strength (Total ELO)</h3>
                <p className="clan-how-text">
                  Rankings use the sum of each member&apos;s best singles or doubles rating. Players without a ranked
                  ladder entry count as 1,000 ELO each.
                </p>
              </div>
            </div>
          </section>

          <section className="clan-panel clan-panel--flush">
            <div className="clan-list-head">
              <h2 className="clan-section-title">Browse clans</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="clan-search"
              />
            </div>
            {listLoading && <p className="clan-empty">Loading clans…</p>}
            {listError && <p className="clan-empty clan-empty--error">{listError}</p>}
            {!listLoading && !listError && list.length === 0 && <p className="clan-empty">No clans yet.</p>}
            <div className="clan-list">
              {list.map((c) => (
                <ClanCard
                  key={c.id}
                  clan={c}
                  canJoin={canRequestJoin}
                  joinHint={getClanJoinHint(c)}
                  joinPending={pendingJoinClanIds.has(c.id)}
                  joinBusy={joinBusyClanId === c.id}
                  onJoin={() => handleJoinRequest(c.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === 'leaderboard' && (
        <section className="clan-panel">
          <h2 className="clan-section-title">Clan leaderboards</h2>
          <p className="clan-section-hint">
            Site-wide rankings by treasury, total ELO, and clan level. #1 on each board earns{' '}
            <strong className="text-[#f0d48a]">{fmt(lbRewardTop1)} AsterynPoints/day</strong>; #2 earns{' '}
            <strong className="text-[#f0d48a]">{fmt(lbRewardTop2)} AsterynPoints/day</strong> in clan treasury (00:00
            Asia/Ho_Chi_Minh).
          </p>
          {lbLoading ? (
            <p className="clan-empty clan-empty--compact">Loading leaderboards…</p>
          ) : (
            <>
              <div className="clan-tabs clan-lb-tabs" role="tablist" aria-label="Leaderboard category">
                <ClanTabButton active={lbView === 'top_treasury'} onClick={() => setLbView('top_treasury')}>
                  Top treasury
                </ClanTabButton>
                <ClanTabButton active={lbView === 'top_total_elo'} onClick={() => setLbView('top_total_elo')}>
                  Total ELO
                </ClanTabButton>
                <ClanTabButton active={lbView === 'top_level'} onClick={() => setLbView('top_level')}>
                  Top level
                </ClanTabButton>
              </div>
              {lbView === 'top_treasury' ? (
                <ClanLeaderboardTable
                  title="Top treasury"
                  hint="Highest current clan treasury balance."
                  rows={lbTreasury}
                  valueKey="bank_balance"
                  valueLabel="treasury"
                  rewardTop1={lbRewardTop1}
                  rewardTop2={lbRewardTop2}
                  showTitle={false}
                />
              ) : lbView === 'top_total_elo' ? (
                <ClanLeaderboardTable
                  title="Total ELO"
                  hint="Highest combined member ELO — each member's best singles or doubles rating, summed together."
                  rows={lbTotalElo}
                  valueKey="total_elo"
                  valueLabel="total ELO"
                  rewardTop1={lbRewardTop1}
                  rewardTop2={lbRewardTop2}
                  showTitle={false}
                />
              ) : (
                <ClanLeaderboardTable
                  title="Top level"
                  hint="Highest clan level from member daily login claims. Ties break on total XP."
                  rows={lbLevel}
                  valueKey="level"
                  valueLabel="level"
                  rewardTop1={lbRewardTop1}
                  rewardTop2={lbRewardTop2}
                  showTitle={false}
                />
              )}
            </>
          )}
        </section>
      )}

      {activeTab === 'mine' && (
        <>
          {!isAuthenticated && (
            <section className="clan-panel clan-panel--center">
              <p className="text-muted mb-3">Sign in to create or manage your clan.</p>
              <button type="button" onClick={() => setShowAuth(true)} className="clan-btn clan-btn-primary">
                Sign in
              </button>
            </section>
          )}

          {isAuthenticated && mineLoading && <p className="clan-empty">Loading your clan…</p>}

          {isAuthenticated && !mineLoading && !myClan && (
            <>
              {inRejoinCooldown && rejoinAvailableAt ? (
                <section className="clan-panel clan-panel--cooldown">
                  <h2 className="clan-section-title">Join cooldown</h2>
                  <p className="clan-section-hint">
                    You left a clan recently. You can request to join another clan in{' '}
                    <strong>{formatRejoinWait(rejoinAvailableAt)}</strong> (after{' '}
                    {new Date(rejoinAvailableAt).toLocaleString()}).
                  </p>
                </section>
              ) : null}
              <section className="clan-panel clan-panel--create">
                <h2 className="clan-section-title">Create a clan</h2>
                <p className="clan-section-hint clan-create-lead">
                  Choose an icon, name your clan, and start building your treasury with members.
                </p>

                <div className="clan-create-cost-card">
                  <div className="clan-create-cost-icon" aria-hidden="true">
                    AsterynPoints
                  </div>
                  <div className="clan-create-cost-body">
                    <span className="clan-create-cost-label">Creation cost</span>
                    <span className="clan-create-cost-value">{fmt(createCost)} AsterynPoints</span>
                    <span className="clan-create-cost-sub">
                      One-time fee · deducted from your website Asteryn Point balance
                    </span>
                  </div>
                </div>

                <p className="clan-create-alt">
                  Prefer to join an existing clan?{' '}
                  <button type="button" className="clan-create-browse-link" onClick={() => setActiveTab('browse')}>
                    Browse clans
                  </button>
                </p>

                <form onSubmit={handleCreate} className="clan-create-form">
                  {createError && <div className="clan-error clan-create-error">{createError}</div>}
                  <div className="clan-create-fields">
                    <div className="clan-create-icon-row">
                      <div className="clan-create-preview-col">
                        {createIconPreview ? (
                          <img src={createIconPreview} alt="Clan icon preview" className="clan-create-preview" />
                        ) : (
                          <div className="clan-create-preview clan-create-preview--empty">Preview</div>
                        )}
                      </div>
                      <div className="clan-create-icon-field">
                        <label className="clan-label" htmlFor="clan-icon">
                          Clan icon
                        </label>
                        <input
                          id="clan-icon"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(e) => setCreateIcon(e.target.files?.[0] ?? null)}
                          className="clan-file-input"
                          required
                        />
                        <p className="clan-field-hint">PNG, JPEG, WebP, or GIF · max 2 MB</p>
                      </div>
                    </div>
                    <div className="clan-create-field">
                      <label className="clan-label" htmlFor="clan-name">
                        Clan name
                      </label>
                      <input
                        id="clan-name"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        maxLength={32}
                        className="clan-input"
                        placeholder="2–32 characters"
                        required
                      />
                    </div>
                    <div className="clan-create-field">
                      <label className="clan-label" htmlFor="clan-bio">
                        Bio
                      </label>
                      <textarea
                        id="clan-bio"
                        value={createBio}
                        onChange={(e) => setCreateBio(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className="clan-input clan-textarea"
                        placeholder="Tell others what your clan is about (optional)"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={createBusy} className="clan-btn clan-btn-primary clan-create-submit">
                    {createBusy ? 'Creating…' : 'Create clan'}
                  </button>
                </form>
              </section>
              {(mine?.my_pending_join_requests?.length ?? 0) > 0 && (
                <section className="clan-panel">
                  <h2 className="clan-section-title">Pending join requests</h2>
                  <ul className="clan-rules-list">
                    {mine!.my_pending_join_requests.map((r) => (
                      <li key={r.id}>Request sent — waiting for the clan leader to accept.</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {myClan && (
            <section className="clan-panel clan-panel--mine">
          <div className="clan-mine-header">
            <img src={myClan.avatar_url} alt="" className="clan-mine-avatar" />
            <div className="clan-mine-head-text">
              <h2 className="clan-mine-name">
                {myClan.name}
                <span className="clan-mine-level">Level {myClan.level}</span>
              </h2>
              <div className="clan-mine-head-meta">
                <ClanLeaderDisplay username={myClan.leader_username} />
                {myClan.my_role !== 'leader' ? (
                  <ClanRoleBadge role="member" highlightYou />
                ) : null}
              </div>
              <p className="clan-mine-members">
                {myClan.member_count} / {myClan.max_members} members
              </p>
              {myClan.bio ? <p className="clan-mine-bio">{myClan.bio}</p> : null}
            </div>
          </div>

          {isLeader ? (
            <div className="clan-settings">
              <h3 className="clan-section-title">Clan settings</h3>
              <p className="clan-section-hint">Update your clan name, icon, and bio. Visible to all members and on browse.</p>
              <form onSubmit={handleUpdateClan} className="clan-settings-form">
                {editError ? <div className="clan-error clan-create-error">{editError}</div> : null}
                <div className="clan-create-fields">
                  <div className="clan-create-icon-row">
                    <div className="clan-create-preview-col">
                      {editIconPreview ? (
                        <img src={editIconPreview} alt="New icon preview" className="clan-create-preview" />
                      ) : (
                        <img src={myClan.avatar_url} alt="" className="clan-create-preview" />
                      )}
                    </div>
                    <div className="clan-create-icon-field">
                      <label className="clan-label" htmlFor="clan-edit-icon">
                        Clan icon
                      </label>
                      <input
                        id="clan-edit-icon"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => setEditIcon(e.target.files?.[0] ?? null)}
                        className="clan-file-input"
                      />
                      <p className="clan-field-hint">Leave empty to keep current icon · PNG, JPEG, WebP, or GIF · max 2 MB</p>
                    </div>
                  </div>
                  <div className="clan-create-field">
                    <label className="clan-label" htmlFor="clan-edit-name">
                      Clan name
                    </label>
                    <input
                      id="clan-edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={32}
                      className="clan-input"
                      placeholder="2–32 characters"
                      required
                    />
                  </div>
                  <div className="clan-create-field">
                    <label className="clan-label" htmlFor="clan-edit-bio">
                      Bio
                    </label>
                    <textarea
                      id="clan-edit-bio"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      maxLength={500}
                      rows={3}
                      className="clan-input clan-textarea"
                      placeholder="Tell others what your clan is about (optional)"
                    />
                  </div>
                </div>
                <button type="submit" disabled={editBusy} className="clan-btn clan-btn-primary clan-create-submit">
                  {editBusy ? 'Saving…' : 'Save changes'}
                </button>
              </form>
              <div className="clan-danger-zone">
                <h4 className="clan-danger-zone-title">Danger zone</h4>
                <p className="clan-danger-zone-hint">
                  Permanently delete this clan. All members are removed; treasury balance is forfeited.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDisbandConfirm(true)}
                  className="clan-btn clan-btn-disband"
                >
                  Disband clan
                </button>
              </div>
            </div>
          ) : null}

          <div className="clan-stat-grid">
            <div className="clan-stat-card clan-stat-card--accent">
              <span className="clan-stat-label">Treasury</span>
              <span className="clan-stat-value">{fmt(myClan.bank_balance)} AsterynPoints</span>
              <span className="clan-stat-sub">
                Shared clan balance. Donations and daily income add here; leader payouts reduce it. Milestones and
                leaderboards use this amount.
              </span>
            </div>
            <div className="clan-stat-card">
              <span className="clan-stat-label">Daily income</span>
              <span className="clan-stat-value clan-stat-value--accent">
                +{fmt(myClan.daily_income_per_day + (myClan.leaderboard_daily_treasury_bonus ?? 0))} AsterynPoints
                {myClan.daily_income_multiplier > 1 ? ` (×${myClan.daily_income_multiplier} members)` : ''}
              </span>
              <span className="clan-stat-sub">
                {fmt(myClan.daily_income_per_day)} AsterynPoints from members
                {(myClan.leaderboard_daily_treasury_bonus ?? 0) > 0
                  ? ` · +${fmt(myClan.leaderboard_daily_treasury_bonus)} AsterynPoints leaderboard bonus`
                  : ''}
              </span>
              {myClan.daily_ticket_bonus > 0 ? (
                <span className="clan-stat-sub">+{myClan.daily_ticket_bonus} ticket(s)/member/day</span>
              ) : null}
            </div>
            <div className="clan-stat-card">
              <span className="clan-stat-label">Total ELO</span>
              {myClan.total_elo != null ? (
                <span className="clan-stat-value">{fmt(myClan.total_elo)}</span>
              ) : (
                <span className="clan-stat-value text-muted">—</span>
              )}
              <span className="clan-stat-sub">{clanTotalEloHint()}</span>
            </div>
            <div className="clan-stat-card">
              <span className="clan-stat-label">Your donations</span>
              <span className="clan-stat-value">{fmt(myClan.my_donated_total)} AsterynPoints</span>
              <span className="clan-stat-sub">Lifetime Asteryn Point you&apos;ve donated to this clan</span>
            </div>
          </div>

          <ClanLeaderboardRewardsPanel
            rewardTop1={myClan.leaderboard_daily_reward_top1 ?? lbRewardTop1}
            rewardTop2={myClan.leaderboard_daily_reward_top2 ?? lbRewardTop2}
            ranks={myClan.leaderboard_ranks ?? { top_treasury: null, top_total_elo: null, top_level: null }}
            dailyBonus={myClan.leaderboard_daily_treasury_bonus ?? 0}
            recentPayouts={myClan.recent_leaderboard_payouts ?? []}
          />

          <ClanLevelProgress clan={myClan} />

          <ClanMilestones clan={myClan} />

          {topDonorsInClan.length > 0 ? (
            <div className="clan-top-donors">
              <h3 className="clan-section-title">Top donors in clan</h3>
              <ol className="clan-top-donors-list">
                {topDonorsInClan.map((m, i) => (
                  <li key={m.user_id} className="clan-top-donors-row">
                    <span className="clan-lb-rank">#{i + 1}</span>
                    <span className="clan-top-donors-name">{m.username}</span>
                    <span className="clan-top-donors-amount">{fmt(m.donated_total)} AsterynPoints</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {isLeader && (mine?.pending_join_requests?.length ?? 0) > 0 && (
            <div className="clan-join-requests">
              <h3 className="clan-section-title">Join requests</h3>
              <ul className="clan-join-list">
                {mine!.pending_join_requests.map((req) => (
                  <li key={req.id} className="clan-join-item">
                    <span>
                      <span className="font-medium text-[#f5efe6]">{req.requester_username}</span>
                      <span className="text-muted"> wants to join</span>
                    </span>
                    <span className="clan-join-actions">
                      <button
                        type="button"
                        disabled={requestActionBusy === req.id}
                        onClick={() => handleAcceptRequest(req.id)}
                        className="clan-btn clan-btn-primary clan-btn-sm"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={requestActionBusy === req.id}
                        onClick={() => handleRejectRequest(req.id)}
                        className="clan-btn clan-btn-ghost clan-btn-sm"
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="clan-members-block">
            <h3 className="clan-section-title">Members</h3>
            <ul className="clan-member-list">
              {[...myClan.members]
                .sort((a, b) => {
                  if (a.role === 'leader') return -1
                  if (b.role === 'leader') return 1
                  const aElo = a.elo ?? -1
                  const bElo = b.elo ?? -1
                  return bElo - aElo
                })
                .map((m) => {
                  const isRanked = m.elo != null
                  const tier = isRanked ? getPvpTierFromElo(m.elo) : null
                  const isYou = user?.id === m.user_id
                  return (
                    <li
                      key={m.user_id}
                      className={`clan-member-row${m.role === 'leader' ? ' clan-member-row--leader' : ''}${isYou ? ' clan-member-row--you' : ''}`}
                    >
                      <div className="clan-member-main">
                        <span className="clan-member-name">
                          {m.username}
                          {isYou ? <span className="clan-member-you-tag">You</span> : null}
                        </span>
                        {m.role === 'leader' ? (
                          <ClanRoleBadge role="leader" />
                        ) : (
                          <span className="clan-member-role-label">Member</span>
                        )}
                      </div>
                      <div className="clan-member-side">
                        <span className="clan-member-elo inline-flex items-center gap-1.5">
                          {isRanked ? (
                            <>
                              {fmt(m.elo!)} ELO
                              {tier ? (
                                <PvPTierBadge slug={tier.slug} displayName={tier.displayName} imgHeightClass="h-5" />
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted">Unranked</span>
                          )}
                        </span>
                        <span className="clan-member-donated">{fmt(m.donated_total)} AsterynPoints donated</span>
                      </div>
                      {isLeader && m.role !== 'leader' ? (
                        <div className="clan-member-actions">
                          <button
                            type="button"
                            className="clan-btn clan-btn-sm clan-btn-secondary"
                            onClick={() => setTransferTarget({ user_id: m.user_id, username: m.username })}
                          >
                            Make leader
                          </button>
                          <button
                            type="button"
                            className="clan-btn clan-btn-sm clan-btn-kick"
                            onClick={() => setKickTarget({ user_id: m.user_id, username: m.username })}
                          >
                            Kick
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
            </ul>
          </div>

          <div className="clan-funds-sections">
            <div className="clan-funds-panel">
              <h3 className="clan-section-title">Donate</h3>
              <p className="clan-section-hint">
                Pay from your wallet into the clan treasury. This increases the balance used for milestones and
                leaderboards.
              </p>
              <form onSubmit={handleDonate} className="clan-treasury-form">
                <div className="clan-treasury-field">
                  <label className="clan-label" htmlFor="donate-amount">
                    Donate Asteryn Point
                  </label>
                  <input
                    id="donate-amount"
                    value={donateAmount}
                    onChange={(e) => setDonateAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="Amount"
                    className="clan-input"
                  />
                </div>
                <button type="submit" disabled={donateBusy} className="clan-btn clan-btn-primary">
                  {donateBusy ? 'Donating…' : 'Donate'}
                </button>
              </form>
              {donateError && <p className="clan-error-text">{donateError}</p>}
            </div>

            {isLeader ? (
              <div className="clan-funds-panel">
                <h3 className="clan-section-title">Treasury payouts</h3>
                <p className="clan-section-hint">
                  Send Asteryn Point from the clan treasury to any member — including yourself. This lowers the treasury and
                  can reduce milestone progress. Leaders can pay out up to{' '}
                  <strong>{fmt(myClan.treasury_daily_disburse_max ?? 3_000_000)} AsterynPoints</strong> per calendar day (resets
                  00:00 Asia/Ho_Chi_Minh).
                </p>
                {myClan.treasury_daily_disburse_remaining != null ? (
                  <p className="clan-section-hint m-0 mb-3">
                    Today: <strong>{fmt(myClan.treasury_daily_disbursed_today ?? 0)}</strong> paid out ·{' '}
                    <strong>{fmt(myClan.treasury_daily_disburse_remaining)}</strong> remaining
                  </p>
                ) : null}
                <form onSubmit={handleDisburse} className="clan-treasury-form">
                  <div className="clan-treasury-field">
                    <label className="clan-label" htmlFor="disburse-member">
                      Send to member
                    </label>
                    <select
                      id="disburse-member"
                      value={disburseUserId}
                      onChange={(e) => setDisburseUserId(e.target.value)}
                      className="clan-input"
                    >
                      <option value="">Select member…</option>
                      {disburseCandidates.map((m) => (
                        <option key={m.user_id} value={String(m.user_id)}>
                          {m.username}
                          {m.role === 'leader' ? ' (leader)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="clan-treasury-field clan-treasury-field--amount">
                    <label className="clan-label" htmlFor="disburse-amount">
                      Amount
                    </label>
                    <input
                      id="disburse-amount"
                      value={disburseAmount}
                      onChange={(e) => setDisburseAmount(e.target.value.replace(/\D/g, ''))}
                      className="clan-input"
                    />
                  </div>
                  <button type="submit" disabled={disburseBusy} className="clan-btn clan-btn-secondary">
                    {disburseBusy ? 'Sending…' : 'Send from treasury'}
                  </button>
                </form>
                {disburseError && <p className="clan-error-text">{disburseError}</p>}
              </div>
            ) : null}
          </div>

          <ClanTreasuryActivity
            donations={myClan.recent_donations ?? []}
            disbursements={myClan.recent_disbursements ?? []}
          />

          {myClan && myClan.my_role === 'member' && (
            <div className="clan-leave-wrap">
              <button type="button" onClick={() => setShowLeaveConfirm(true)} className="clan-btn clan-btn-leave">
                Leave clan
              </button>
            </div>
          )}
            </section>
          )}
        </>
      )}

      {showLeaveConfirm && myClan ? (
        <ClanLeaveConfirmModal
          clanName={myClan.name}
          busy={leaveBusy}
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={() => void handleLeaveClan()}
        />
      ) : null}

      {showDisbandConfirm && myClan ? (
        <ClanDisbandConfirmModal
          clanName={myClan.name}
          memberCount={myClan.member_count}
          treasuryBalance={myClan.bank_balance}
          busy={disbandBusy}
          onCancel={() => setShowDisbandConfirm(false)}
          onConfirm={() => void handleDisbandClan()}
        />
      ) : null}

      {kickTarget ? (
        <ClanKickConfirmModal
          username={kickTarget.username}
          busy={kickBusy}
          onCancel={() => setKickTarget(null)}
          onConfirm={() => void handleKickMember()}
        />
      ) : null}

      {transferTarget && myClan ? (
        <ClanTransferLeaderModal
          username={transferTarget.username}
          clanName={myClan.name}
          busy={transferBusy}
          onCancel={() => setTransferTarget(null)}
          onConfirm={() => void handleTransferLeadership()}
        />
      ) : null}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </PageShell>
  )
}
