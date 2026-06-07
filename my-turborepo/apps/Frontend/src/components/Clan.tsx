import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from './AuthModal'
import {
  acceptClanJoinRequest,
  createClan,
  disburseClanFunds,
  donateToClan,
  fetchClans,
  fetchMyClan,
  leaveClan,
  rejectClanJoinRequest,
  requestJoinClan,
  type ClanPublic,
  type MyClanResponse,
} from '../authApi'

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function ClanCard({
  clan,
  canJoin,
  joinPending,
  joinBusy,
  onJoin,
}: {
  clan: ClanPublic
  canJoin: boolean
  joinPending: boolean
  joinBusy: boolean
  onJoin: () => void
}) {
  const isFull = clan.member_count >= clan.max_members

  return (
    <article className="pixel-panel-soft p-4 sm:p-5 flex gap-4 items-start">
      <img
        src={clan.avatar_url}
        alt=""
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-border shrink-0 bg-[#0f0d0b]"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold text-[#f5efe6] truncate">{clan.name}</h3>
        <p className="text-sm text-muted mt-0.5">
          Leader: <span className="text-[#ecebff]">{clan.leader_username}</span>
        </p>
        <p className="text-sm text-accent mt-1">
          {clan.member_count} / {clan.max_members} members
        </p>
        {clan.bio && <p className="text-sm text-muted mt-2 line-clamp-2">{clan.bio}</p>}
        <p className="text-xs text-muted/80 mt-2">
          Fund: {fmt(clan.bank_balance)} CD · Daily +{fmt(clan.daily_income_per_day)} CD
          {clan.daily_income_multiplier > 1 ? ` (×${clan.daily_income_multiplier})` : ''}
        </p>
        {canJoin && (
          <div className="mt-3">
            {joinPending ? (
              <span className="text-sm text-muted">Join request pending</span>
            ) : isFull ? (
              <span className="text-sm text-muted">Clan full</span>
            ) : (
              <button
                type="button"
                disabled={joinBusy}
                onClick={onJoin}
                className="px-4 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-semibold disabled:opacity-60"
              >
                {joinBusy ? 'Sending…' : 'Join'}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export function Clan() {
  const { isAuthenticated } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [list, setList] = useState<ClanPublic[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState<MyClanResponse | null>(null)
  const [mineLoading, setMineLoading] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createBio, setCreateBio] = useState('')
  const [createIcon, setCreateIcon] = useState<File | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [donateAmount, setDonateAmount] = useState('')
  const [donateBusy, setDonateBusy] = useState(false)
  const [donateError, setDonateError] = useState<string | null>(null)

  const [disburseUsername, setDisburseUsername] = useState('')
  const [disburseAmount, setDisburseAmount] = useState('')
  const [disburseBusy, setDisburseBusy] = useState(false)
  const [disburseError, setDisburseError] = useState<string | null>(null)

  const [joinBusyClanId, setJoinBusyClanId] = useState<number | null>(null)
  const [requestActionBusy, setRequestActionBusy] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const loadList = useCallback(() => {
    setListLoading(true)
    setListError(null)
    fetchClans({ q: search.trim(), limit: 100 })
      .then(({ rows }) => setList(rows))
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
    loadList()
  }, [loadList])

  useEffect(() => {
    loadMine()
  }, [loadMine])

  const myClan = mine?.clan ?? null
  const isLeader = myClan?.my_role === 'leader'
  const pendingJoinClanIds = useMemo(
    () => new Set((mine?.my_pending_join_requests ?? []).map((r) => r.clan_id)),
    [mine?.my_pending_join_requests]
  )

  const rulesSummary = useMemo(
    () => (
      <ul className="text-sm text-muted space-y-1 list-disc list-inside">
        <li>Create clan: 1,000,000 website Cobble$</li>
        <li>Players send a join request; the leader accepts or rejects</li>
        <li>Starts at 2 members max — +1 slot every 250,000 CD donated (max 5)</li>
        <li>Daily clan fund: 50,000 CD × members (resets 00:00 Asia/Ho_Chi_Minh)</li>
        <li>Total donated ≥ 1,500,000 → +50% daily income</li>
        <li>Total donated ≥ 2,000,000 → +100% daily income + 2 tickets/member/day</li>
        <li>Leader sends funds from the clan bank to members</li>
      </ul>
    ),
    []
  )

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
      loadList()
      loadMine()
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
      setActionMsg('Donation sent to clan!')
      loadMine()
      loadList()
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
    if (!Number.isInteger(amount) || amount < 1) {
      setDisburseError('Enter a valid amount.')
      return
    }
    setDisburseBusy(true)
    setDisburseError(null)
    try {
      await disburseClanFunds(myClan.id, disburseUsername.trim(), amount)
      setDisburseAmount('')
      setDisburseUsername('')
      setActionMsg('Funds sent to member.')
      loadMine()
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
    setJoinBusyClanId(clanId)
    requestJoinClan(clanId)
      .then(() => {
        setActionMsg('Join request sent! Wait for the leader to accept.')
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
      })
      .catch((e) => setActionMsg(e instanceof Error ? e.message : 'Accept failed'))
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
    <div className="w-full max-w-5xl mx-auto py-8 px-2 sm:px-0">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#f5efe6]">Clans</h1>
        <p className="text-muted mt-2 max-w-2xl">
          Team up with friends, grow your clan fund, and unlock more member slots through donations.
        </p>
      </header>

      {actionMsg && (
        <div className="mb-4 p-3 rounded-lg bg-accent/15 border border-accent/30 text-accent text-sm">
          {actionMsg}
          <button type="button" className="ml-3 underline" onClick={() => setActionMsg(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="pixel-panel-soft p-5 mb-8">
        <h2 className="text-lg font-semibold text-[#f5efe6] mb-3">Rules</h2>
        {rulesSummary}
      </section>

      {isAuthenticated && !mineLoading && !myClan && (
        <section className="pixel-panel-soft p-5 mb-8">
          <h2 className="text-lg font-semibold text-[#f5efe6] mb-4">Create a clan</h2>
          <p className="text-sm text-muted mb-4">Cost: 1,000,000 website Cobble$</p>
          <form onSubmit={handleCreate} className="space-y-4 max-w-md">
            {createError && (
              <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">{createError}</div>
            )}
            <div>
              <label className="block text-sm text-muted mb-1">Clan icon</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setCreateIcon(e.target.files?.[0] ?? null)}
                className="text-sm text-muted"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Clan name</label>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={32}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0f0d0b]/80 border border-border text-[#f5efe6]"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Bio</label>
              <textarea
                value={createBio}
                onChange={(e) => setCreateBio(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0f0d0b]/80 border border-border text-[#f5efe6]"
              />
            </div>
            <button
              type="submit"
              disabled={createBusy}
              className="px-6 py-2.5 rounded-xl bg-accent text-[#1a1510] font-semibold disabled:opacity-60"
            >
              {createBusy ? 'Creating…' : 'Create clan'}
            </button>
          </form>
        </section>
      )}

      {!isAuthenticated && (
        <section className="pixel-panel-soft p-5 mb-8 text-center">
          <p className="text-muted mb-3">Sign in to create or join a clan.</p>
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="px-6 py-2.5 rounded-xl bg-accent text-[#1a1510] font-semibold"
          >
            Sign in
          </button>
        </section>
      )}

      {myClan && (
        <section className="pixel-panel-soft p-5 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start mb-6">
            <img
              src={myClan.avatar_url}
              alt=""
              className="w-24 h-24 rounded-xl object-cover border border-border bg-[#0f0d0b]"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[#f5efe6]">{myClan.name}</h2>
              <p className="text-sm text-muted mt-1">
                Leader: {myClan.leader_username} · You: {myClan.my_role}
              </p>
              <p className="text-accent font-medium mt-1">
                {myClan.member_count} / {myClan.max_members} members
              </p>
              {myClan.bio && <p className="text-sm text-muted mt-2">{myClan.bio}</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-6 text-sm">
            <div className="rounded-xl bg-[#0f0d0b]/50 border border-border p-3">
              <div className="text-muted">Clan fund</div>
              <div className="text-lg font-semibold text-[#f5efe6]">{fmt(myClan.bank_balance)} CD</div>
            </div>
            <div className="rounded-xl bg-[#0f0d0b]/50 border border-border p-3">
              <div className="text-muted">Total donated</div>
              <div className="text-lg font-semibold text-[#f5efe6]">{fmt(myClan.total_donated)} CD</div>
            </div>
            <div className="rounded-xl bg-[#0f0d0b]/50 border border-border p-3">
              <div className="text-muted">Daily income</div>
              <div className="text-lg font-semibold text-accent">
                +{fmt(myClan.daily_income_per_day)} CD/day
                {myClan.daily_income_multiplier > 1 ? ` (×${myClan.daily_income_multiplier})` : ''}
              </div>
            </div>
            <div className="rounded-xl bg-[#0f0d0b]/50 border border-border p-3">
              <div className="text-muted">Your donations</div>
              <div className="text-lg font-semibold text-[#f5efe6]">{fmt(myClan.my_donated_total)} CD</div>
            </div>
          </div>

          {myClan.next_member_unlock_donation != null && myClan.member_count >= myClan.max_members && (
            <p className="text-sm text-muted mb-4">
              Donate {fmt(myClan.next_member_unlock_donation)} more CD (clan total) to unlock +1 member slot.
            </p>
          )}

          {myClan.has_daily_ticket_bonus && (
            <p className="text-sm text-accent mb-4">
              Max milestone reached — each member receives +{myClan.daily_ticket_bonus} tickets daily.
            </p>
          )}

          {isLeader && (mine?.pending_join_requests?.length ?? 0) > 0 && (
            <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <h3 className="font-semibold text-[#f5efe6] mb-3">Join requests</h3>
              <ul className="space-y-2">
                {mine!.pending_join_requests.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/40 last:border-0"
                  >
                    <span className="text-sm">
                      <span className="text-[#f5efe6] font-medium">{req.requester_username}</span>
                      <span className="text-muted"> wants to join</span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={requestActionBusy === req.id}
                        onClick={() => handleAcceptRequest(req.id)}
                        className="px-3 py-1 rounded-lg bg-accent text-[#1a1510] text-sm font-medium disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={requestActionBusy === req.id}
                        onClick={() => handleRejectRequest(req.id)}
                        className="px-3 py-1 rounded-lg border border-border text-muted text-sm disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLeader && (mine?.pending_join_requests?.length ?? 0) === 0 && (
            <p className="text-sm text-muted mb-4">No pending join requests.</p>
          )}

          <h3 className="font-semibold text-[#f5efe6] mb-2">Members</h3>
          <ul className="space-y-2 mb-6">
            {myClan.members.map((m) => (
              <li
                key={m.user_id}
                className="flex justify-between items-center text-sm py-2 border-b border-border/50"
              >
                <span>
                  {m.username}{' '}
                  <span className="text-muted">({m.role})</span>
                </span>
                <span className="text-muted">{fmt(m.donated_total)} CD donated</span>
              </li>
            ))}
          </ul>

          <form onSubmit={handleDonate} className="flex flex-wrap gap-2 items-end mb-6 max-w-lg">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-muted mb-1">Donate to clan (your CD)</label>
              <input
                value={donateAmount}
                onChange={(e) => setDonateAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="Amount"
                className="w-full px-3 py-2 rounded-lg bg-[#0f0d0b]/80 border border-border text-[#f5efe6]"
              />
            </div>
            <button
              type="submit"
              disabled={donateBusy}
              className="px-4 py-2 rounded-lg bg-accent/90 text-[#1a1510] font-semibold disabled:opacity-60"
            >
              Donate
            </button>
          </form>
          {donateError && <p className="text-error text-sm mb-4">{donateError}</p>}

          {isLeader && (
            <>
              <form onSubmit={handleDisburse} className="flex flex-wrap gap-2 items-end mb-4 max-w-lg">
                <div className="min-w-[120px] flex-1">
                  <label className="block text-xs text-muted mb-1">Send to member</label>
                  <input
                    value={disburseUsername}
                    onChange={(e) => setDisburseUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0f0d0b]/80 border border-border text-[#f5efe6]"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs text-muted mb-1">Amount</label>
                  <input
                    value={disburseAmount}
                    onChange={(e) => setDisburseAmount(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 rounded-lg bg-[#0f0d0b]/80 border border-border text-[#f5efe6]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={disburseBusy}
                  className="px-4 py-2 rounded-lg bg-accent/90 text-[#1a1510] font-semibold disabled:opacity-60"
                >
                  Send
                </button>
              </form>
              {disburseError && <p className="text-error text-sm mb-4">{disburseError}</p>}
            </>
          )}

          {myClan.my_role === 'member' && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Leave this clan?')) return
                leaveClan()
                  .then(() => {
                    setActionMsg('Left clan.')
                    loadMine()
                    loadList()
                  })
                  .catch((e) => setActionMsg(e instanceof Error ? e.message : 'Leave failed'))
              }}
              className="text-sm text-error underline"
            >
              Leave clan
            </button>
          )}
        </section>
      )}

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#f5efe6]">All clans</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="sm:ml-auto px-4 py-2 rounded-xl bg-[#0f0d0b]/80 border border-border text-[#f5efe6] max-w-xs w-full"
          />
        </div>
        {listLoading && <p className="text-muted py-8 text-center">Loading clans…</p>}
        {listError && <p className="text-error py-8 text-center">{listError}</p>}
        {!listLoading && !listError && list.length === 0 && (
          <p className="text-muted py-8 text-center">No clans yet.</p>
        )}
        <div className="grid gap-4">
          {list.map((c) => (
            <ClanCard
              key={c.id}
              clan={c}
              canJoin={isAuthenticated && !myClan}
              joinPending={pendingJoinClanIds.has(c.id)}
              joinBusy={joinBusyClanId === c.id}
              onJoin={() => handleJoinRequest(c.id)}
            />
          ))}
        </div>
      </section>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
