import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  adminClearMatchWinner,
  adminCreateTournament,
  adminFetchBracket,
  adminListTournaments,
  adminParsePokepaste,
  adminPatchTournament,
  adminSetMatchWinner,
  adminUpsertParticipant,
  adminFetchTournamentPredictionBets,
  adminFetchTournamentPredictionSettings,
  adminUpdateTournamentPredictionSettings,
  type AdminTournamentPredictionBetEntry,
  type AdminTournamentPredictionPickSummary,
  type TournamentBracketMatch,
  type TournamentBracketSlot,
} from '../authApi'
import { formatBracketMatchKeyLabel } from '../bracketLabels'
import { AdminUserSearchField } from './AdminUserSearchField'

type TRow = {
  id: number
  slug: string
  title: string
  subtitle?: string | null
  is_published?: boolean
  bracket_size?: number
}

type ParticipantSummary = {
  id: number
  seed_rank: number
  display_name: string
  pokepaste_raw?: string | null
}

function participantAtSeed(
  participants: ParticipantSummary[],
  seed: number
): ParticipantSummary | undefined {
  return participants.find((p) => p.seed_rank === seed)
}

const DEFAULT_QF_FEED: [number, number, number, number] = [3, 2, 1, 0]

const DEFAULT_PRIZES_LINES = [
  'Top 1: 500.000 VND + 1 month of Spotify',
  'Top 2: 300.000 VND',
  'Top 3: 150.000 VND',
  'Top 4: 50.000 VND',
] as const

function prizesToDraft(raw: unknown): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    .filter((s) => s.length > 0)
    .join('\n')
}

function draftToPrizes(draft: string): string[] {
  return draft
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseQfDraft(raw: unknown): [number, number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 4) return [...DEFAULT_QF_FEED]
  const nums = raw.map((x) => (typeof x === 'number' ? x : parseInt(String(x), 10)))
  if (!nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 3)) return [...DEFAULT_QF_FEED]
  if (new Set(nums).size !== 4) return [...DEFAULT_QF_FEED]
  return nums as [number, number, number, number]
}

const btnBase =
  'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12]'

const btnPrimary = `${btnBase} px-4 py-2.5 text-sm bg-cyan-600 text-white border border-cyan-500 shadow-md shadow-cyan-950/35 hover:bg-cyan-500 hover:shadow-lg hover:shadow-cyan-900/45`
const btnSecondary = `${btnBase} px-3 py-2 text-sm border border-stone-400/45 bg-stone-950/50 text-stone-100 hover:bg-stone-900/55 hover:border-stone-300/55 hover:shadow-md hover:shadow-stone-950/30`
const btnGhost = `${btnBase} px-3 py-2 text-sm border border-white/12 bg-white/[0.06] text-slate-200 hover:bg-white/12 hover:border-white/22`
const btnSuccess = `${btnBase} px-3 py-2 text-xs border border-emerald-500/45 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/45 hover:border-emerald-400/60`
const btnMuted = `${btnBase} px-3 py-2 text-xs border border-slate-500/35 bg-slate-900/40 text-slate-300 hover:bg-slate-800/55 hover:border-slate-400/40`
const btnWin = `${btnBase} px-3 py-2 text-xs border border-cyan-400/35 bg-cyan-950/35 text-cyan-100 hover:bg-cyan-900/45 hover:border-accent/50 disabled:hover:bg-cyan-950/35`
const btnClear = `${btnBase} px-3 py-2 text-xs border border-violet-500/40 bg-violet-950/25 text-violet-100 hover:bg-violet-900/35`

const fieldClass =
  'w-full rounded-xl border border-violet-500/30 bg-[#151524]/90 px-3 py-2.5 text-sm text-[#f5efe6] placeholder:text-slate-500 transition-colors hover:border-violet-400/45 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/25 outline-none'

const cardClass =
  'rounded-2xl border border-violet-500/25 bg-[#0f1020]/55 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/25'

const panelClass =
  'rounded-xl border border-violet-500/20 bg-[#121426]/50 p-4 space-y-3'

type AdminTab = 'bracket' | 'predictions'

function AdminTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-cyan-400 text-cyan-100'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500/40'
      }`}
    >
      {children}
    </button>
  )
}

function slotLine(slot: TournamentBracketSlot): string {
  if (slot.kind === 'participant') return slot.name ?? '—'
  if (slot.kind === 'winner_of' && slot.matchKey) return formatBracketMatchKeyLabel(slot.matchKey)
  if (slot.kind === 'loser_of' && slot.matchKey)
    return `Loser of ${formatBracketMatchKeyLabel(slot.matchKey)}`
  return 'TBD'
}

function roundPill(round: TournamentBracketMatch['round']): string {
  const labels: Record<TournamentBracketMatch['round'], string> = {
    round_of_16: 'Round of 16',
    qualifying: 'Qualifier',
    quarter: 'Quarter-final',
    semi: 'Semi-final',
    final: 'Final',
    third: '3rd place',
  }
  return labels[round]
}

function bracketSizeFromUnknown(v: unknown): 8 | 12 | 16 {
  const n = Number(v)
  if (n === 8) return 8
  if (n === 16) return 16
  return 12
}

function bracketSizeLabel(size: 8 | 12 | 16): string {
  return `${size} players`
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TournamentAdmin() {
  const [tournaments, setTournaments] = useState<TRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [bracket, setBracket] = useState<TournamentBracketMatch[]>([])
  const [participants, setParticipants] = useState<ParticipantSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [adminTab, setAdminTab] = useState<AdminTab>('bracket')

  const [newSlug, setNewSlug] = useState('championship-s1')
  const [newTitle, setNewTitle] = useState('Asteryn Cobblemon SMP Championship Season 1')
  const [newSubtitle, setNewSubtitle] = useState('National Dex OU Singles — Bo3')
  /** Bracket layout for newly created tournaments. */
  const [newBracketSize, setNewBracketSize] = useState<8 | 12 | 16>(12)
  /** Loaded tournament bracket size (seeds + qualifying UI). */
  const [loadedBracketSize, setLoadedBracketSize] = useState<8 | 12 | 16>(12)

  const [seedRank, setSeedRank] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [pokepaste, setPokepaste] = useState('')
  const [parsePreview, setParsePreview] = useState<number | null>(null)
  const [qfQualDraft, setQfQualDraft] = useState<[number, number, number, number]>([...DEFAULT_QF_FEED])
  const [prizesDraft, setPrizesDraft] = useState('')

  const [editSlug, setEditSlug] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')

  const [predTournamentId, setPredTournamentId] = useState<string>('')
  const [predLockedAt, setPredLockedAt] = useState('')
  const [predMaxStake, setPredMaxStake] = useState('20000')
  const [predMinStake, setPredMinStake] = useState('100')
  const [predChampMult, setPredChampMult] = useState('2')
  const [predRuMult, setPredRuMult] = useState('2')
  const [predSaving, setPredSaving] = useState(false)
  const [betHistoryTournamentId, setBetHistoryTournamentId] = useState<string>('')
  const [betHistoryLoading, setBetHistoryLoading] = useState(false)
  const [betHistoryEntries, setBetHistoryEntries] = useState<AdminTournamentPredictionBetEntry[]>([])
  const [betHistoryChampSummary, setBetHistoryChampSummary] = useState<
    AdminTournamentPredictionPickSummary[]
  >([])
  const [betHistoryRuSummary, setBetHistoryRuSummary] = useState<AdminTournamentPredictionPickSummary[]>(
    []
  )
  const [betHistoryMeta, setBetHistoryMeta] = useState<{
    title: string
    totalEntries: number
    totalStaked: number
  } | null>(null)

  const qfDraftIsPermutation = new Set(qfQualDraft).size === 4

  const refreshList = useCallback(() => {
    adminListTournaments()
      .then((r) => setTournaments((r.tournaments as TRow[]) ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'List failed'))
  }, [])

  const loadBracket = useCallback((id: number) => {
    setLoading(true)
    setErr(null)
    adminFetchBracket(id)
      .then((r) => {
        setBracket(r.bracket)
        const t = r.tournament as {
          slug?: string
          title?: string
          subtitle?: string | null
          qf_qual_feed?: unknown
          prizes?: unknown
          bracket_size?: unknown
        } | undefined
        if (t?.slug) setEditSlug(t.slug)
        if (typeof t?.title === 'string') setEditTitle(t.title)
        setEditSubtitle(typeof t?.subtitle === 'string' ? t.subtitle : '')
        const bs = bracketSizeFromUnknown(t?.bracket_size)
        setLoadedBracketSize(bs)
        setSeedRank((prev) => Math.min(prev, bs))
        setQfQualDraft(parseQfDraft(t?.qf_qual_feed))
        setPrizesDraft(prizesToDraft(t?.prizes))
        setParticipants(
          (
            r.participants as {
              id: number
              seed_rank: number
              display_name: string
              pokepaste_raw?: string | null
            }[]
          ).map((p) => ({
            id: p.id,
            seed_rank: p.seed_rank,
            display_name: p.display_name,
            pokepaste_raw: p.pokepaste_raw ?? null,
          }))
        )
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Bracket failed'))
      .finally(() => setLoading(false))
  }, [])

  const loadPredictionSettings = useCallback(() => {
    adminFetchTournamentPredictionSettings()
      .then((r) => {
        const s = r.settings
        if (s) {
          setPredTournamentId(s.tournamentId != null ? String(s.tournamentId) : '')
          setPredLockedAt(isoToDatetimeLocal(s.predictionsLockedAt))
          setPredMaxStake(String(s.maxStake))
          setPredMinStake(String(s.minStake))
          setPredChampMult(String(s.championWinMultiplier))
          setPredRuMult(String(s.runnerUpWinMultiplier))
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Prediction settings failed'))
  }, [])

  useEffect(() => {
    refreshList()
    loadPredictionSettings()
  }, [refreshList, loadPredictionSettings])

  useEffect(() => {
    if (selectedId == null) {
      setEditSlug('')
      setEditTitle('')
      setEditSubtitle('')
      return
    }
    const t = tournaments.find((row) => row.id === selectedId)
    if (t) {
      setEditSlug(t.slug)
      setEditTitle(t.title)
      setEditSubtitle(typeof t.subtitle === 'string' ? t.subtitle : '')
    }
  }, [selectedId, tournaments])

  useEffect(() => {
    if (selectedId != null) loadBracket(selectedId)
  }, [selectedId, loadBracket])

  useEffect(() => {
    const p = participantAtSeed(participants, seedRank)
    setDisplayName(p?.display_name ?? '')
    setPokepaste(p?.pokepaste_raw ?? '')
    setParsePreview(null)
  }, [seedRank, participants])

  useEffect(() => {
    if (predTournamentId && !betHistoryTournamentId) {
      setBetHistoryTournamentId(predTournamentId)
    }
  }, [predTournamentId, betHistoryTournamentId])

  const loadBetHistory = useCallback(async () => {
    const tid = betHistoryTournamentId ? parseInt(betHistoryTournamentId, 10) : NaN
    if (!Number.isFinite(tid)) {
      setErr('Choose a tournament to load bet history.')
      return
    }
    setBetHistoryLoading(true)
    setErr(null)
    try {
      const r = await adminFetchTournamentPredictionBets(tid)
      setBetHistoryEntries(r.entries)
      setBetHistoryChampSummary(r.summary.champion)
      setBetHistoryRuSummary(r.summary.runnerUp)
      setBetHistoryMeta({
        title: r.tournament.title,
        totalEntries: r.summary.totalEntries,
        totalStaked: r.summary.totalStaked,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bet history failed')
      setBetHistoryEntries([])
      setBetHistoryChampSummary([])
      setBetHistoryRuSummary([])
      setBetHistoryMeta(null)
    } finally {
      setBetHistoryLoading(false)
    }
  }, [betHistoryTournamentId])

  const handleParsePreview = async () => {
    setErr(null)
    try {
      const r = await adminParsePokepaste(pokepaste)
      setParsePreview(r.count)
      setMsg(`Parsed ${r.count} Pokémon`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Parse failed')
    }
  }

  const handleSaveParticipant = async () => {
    if (selectedId == null || !displayName.trim()) return
    setErr(null)
    try {
      await adminUpsertParticipant(selectedId, seedRank, {
        display_name: displayName.trim(),
        pokepaste_raw: pokepaste,
      })
      setMsg(`Saved seed ${seedRank}`)
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const handleCreate = async () => {
    setErr(null)
    try {
      const r = await adminCreateTournament({
        slug: newSlug.trim().toLowerCase(),
        title: newTitle.trim(),
        subtitle: newSubtitle.trim(),
        prizes: [...DEFAULT_PRIZES_LINES],
        is_published: false,
        bracket_size: newBracketSize,
      })
      const t = r.tournament as TRow
      setMsg('Tournament created — set participants, then publish.')
      refreshList()
      if (t?.id) setSelectedId(t.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed')
    }
  }

  const handlePublish = async (pub: boolean) => {
    if (selectedId == null) return
    try {
      await adminPatchTournament(selectedId, { is_published: pub })
      setMsg(pub ? 'Published' : 'Unpublished')
      refreshList()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleSaveQfPairings = async () => {
    if (selectedId == null || !qfDraftIsPermutation) return
    setErr(null)
    try {
      await adminPatchTournament(selectedId, { qf_qual_feed: [...qfQualDraft] })
      setMsg('Quarter-final pairings saved')
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save pairings failed')
    }
  }

  const handleSaveDetails = async () => {
    if (selectedId == null) return
    const slug = editSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const title = editTitle.trim()
    if (!slug || !title) {
      setErr('Title and slug are required')
      return
    }
    setErr(null)
    try {
      await adminPatchTournament(selectedId, {
        slug,
        title,
        subtitle: editSubtitle.trim(),
      })
      setEditSlug(slug)
      setEditTitle(title)
      setMsg('Tournament name and slug saved')
      refreshList()
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save details failed')
    }
  }

  const handleSavePrizes = async () => {
    if (selectedId == null) return
    setErr(null)
    try {
      const prizes = draftToPrizes(prizesDraft)
      await adminPatchTournament(selectedId, { prizes })
      setMsg('Prizes saved')
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save prizes failed')
    }
  }

  const setWinner = async (matchKey: string, winnerParticipantId: number) => {
    if (selectedId == null) return
    try {
      await adminSetMatchWinner(selectedId, matchKey, winnerParticipantId)
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Set winner failed')
    }
  }

  const clearWinner = async (matchKey: string) => {
    if (selectedId == null) return
    try {
      await adminClearMatchWinner(selectedId, matchKey)
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Clear failed')
    }
  }

  const handleSavePredictionSettings = async () => {
    setPredSaving(true)
    setErr(null)
    try {
      const maxStake = parseInt(predMaxStake.replace(/,/g, ''), 10)
      const minStake = parseInt(predMinStake.replace(/,/g, ''), 10)
      const championWinMultiplier = parseFloat(predChampMult)
      const runnerUpWinMultiplier = parseFloat(predRuMult)
      if (!Number.isInteger(maxStake) || maxStake < 1) {
        throw new Error('Max stake must be a positive integer')
      }
      await adminUpdateTournamentPredictionSettings({
        tournamentId: predTournamentId ? parseInt(predTournamentId, 10) : null,
        predictionsLockedAt: predLockedAt.trim() ? new Date(predLockedAt).toISOString() : null,
        maxStake,
        minStake,
        championWinMultiplier,
        runnerUpWinMultiplier,
      })
      setMsg('Tournament prediction settings saved')
      loadPredictionSettings()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save prediction settings failed')
    } finally {
      setPredSaving(false)
    }
  }

  const handleSaveBracketSize = async (size: 8 | 12 | 16) => {
    if (selectedId == null) return
    setErr(null)
    try {
      await adminPatchTournament(selectedId, { bracket_size: size })
      setLoadedBracketSize(size)
      setMsg(
        size === 8
          ? 'Bracket set to 8 players (no qualifying round).'
          : size === 16
            ? 'Bracket set to 16 players (round of 16 → quarters).'
            : 'Bracket set to 12 players.'
      )
      refreshList()
      loadBracket(selectedId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save bracket size failed')
    }
  }

  const selectClass =
    'w-full rounded-xl border border-violet-500/30 bg-[#151524]/90 px-3 py-2.5 text-sm text-[#f5efe6] transition-colors hover:border-violet-400/45 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/25 outline-none'

  const selectedTournament = tournaments.find((t) => t.id === selectedId) ?? null

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 pb-16 text-left">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-white m-0 bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
          Tournaments
        </h2>
        <p className="text-sm text-muted m-0">
          Manage brackets, publish events, and configure Asteryn Point predictions from the tabs below.
        </p>
      </header>

      {msg ? (
        <p className="text-sm text-emerald-300 m-0 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="text-sm text-red-300 m-0 px-4 py-3 rounded-xl border border-red-500/35 bg-red-950/30">{err}</p>
      ) : null}

      <section className={panelClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex-1 min-w-[14rem] block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
              Working tournament
            </span>
            <select
              className={selectClass}
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">Choose a tournament…</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {bracketSizeFromUnknown(t.bracket_size)}p · {t.slug}{' '}
                  {t.is_published ? '· live' : '· draft'}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 shrink-0">
            {selectedId != null ? (
              <>
                <button type="button" onClick={() => handlePublish(true)} className={btnSuccess}>
                  Publish
                </button>
                <button type="button" onClick={() => handlePublish(false)} className={btnMuted}>
                  Unpublish
                </button>
              </>
            ) : null}
          </div>
        </div>
        {selectedTournament ? (
          <p className="text-xs text-slate-400 m-0">
            <span className="text-[#f5efe6] font-medium">{selectedTournament.title}</span>
            {' · '}
            {bracketSizeLabel(bracketSizeFromUnknown(selectedTournament.bracket_size))}
            {' · '}
            {selectedTournament.is_published ? (
              <span className="text-emerald-300">Published on main site</span>
            ) : (
              <span className="text-amber-200/90">Draft (not on main site)</span>
            )}
          </p>
        ) : (
          <p className="text-xs text-muted m-0">Select a tournament to edit the bracket, or create one below.</p>
        )}
        <details className="group rounded-xl border border-violet-500/20 bg-[#121426]/40 open:border-violet-400/35">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 hover:text-white [&::-webkit-details-marker]:hidden">
            <span className="text-cyan-200/90">+</span> Create new tournament
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-violet-500/15">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={fieldClass}
                placeholder="URL slug (e.g. spring-2026)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
              <input
                className={fieldClass}
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <input
                className={`${fieldClass} sm:col-span-2`}
                placeholder="Subtitle / format"
                value={newSubtitle}
                onChange={(e) => setNewSubtitle(e.target.value)}
              />
              <fieldset className="sm:col-span-2 rounded-xl border border-violet-500/25 px-4 py-3 space-y-2">
                <legend className="text-xs font-semibold text-cyan-200/95 px-1">Bracket size</legend>
                <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="radio"
                    name="newBs"
                    checked={newBracketSize === 12}
                    onChange={() => setNewBracketSize(12)}
                  />
                  <span>
                    <span className="font-medium text-[#f5efe6]">12 players</span>
                    <span className="block text-xs text-muted">
                      Qualifying (seeds 5–12), then quarters with configurable qual → QF pairings.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="radio"
                    name="newBs"
                    checked={newBracketSize === 8}
                    onChange={() => setNewBracketSize(8)}
                  />
                  <span>
                    <span className="font-medium text-[#f5efe6]">8 players</span>
                    <span className="block text-xs text-muted">
                      Quarter-finals immediately: seed 1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="radio"
                    name="newBs"
                    checked={newBracketSize === 16}
                    onChange={() => setNewBracketSize(16)}
                  />
                  <span>
                    <span className="font-medium text-[#f5efe6]">16 players</span>
                    <span className="block text-xs text-muted">
                      Round of 16 (1 vs 16 … 8 vs 9), then quarters, semis, final &amp; 3rd place.
                    </span>
                  </span>
                </label>
              </fieldset>
            </div>
            <button type="button" onClick={handleCreate} className={btnPrimary}>
              Create tournament
            </button>
          </div>
        </details>
      </section>

      <nav
        className="flex gap-0 border-b border-violet-500/25 -mb-px"
        aria-label="Tournament admin sections"
      >
        <AdminTabButton active={adminTab === 'bracket'} onClick={() => setAdminTab('bracket')}>
          Bracket &amp; matches
        </AdminTabButton>
        <AdminTabButton active={adminTab === 'predictions'} onClick={() => setAdminTab('predictions')}>
          Predictions &amp; bets
        </AdminTabButton>
      </nav>

      {adminTab === 'predictions' ? (
        <div className="space-y-5">
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">
              Prediction settings
            </h3>
        <p className="text-xs text-muted m-0 leading-relaxed">
          Choose which tournament users can bet on (champion + runner-up). Leave tournament empty to disable
          predictions. Set a lock date — after that, users cannot submit. Payouts run automatically when you set the
          final match winner in the Bracket tab.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 block space-y-1">
            <span className="text-xs text-slate-400">Active tournament</span>
            <select
              className={selectClass}
              value={predTournamentId}
              onChange={(e) => setPredTournamentId(e.target.value)}
            >
              <option value="">None (predictions off)</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.slug}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Lock predictions at (local time)</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={predLockedAt}
              onChange={(e) => setPredLockedAt(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Max stake (Asteryn Point)</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              value={predMaxStake}
              onChange={(e) => setPredMaxStake(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Min stake</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              value={predMinStake}
              onChange={(e) => setPredMinStake(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Champion win multiplier</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={predChampMult}
              onChange={(e) => setPredChampMult(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Runner-up win multiplier</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={predRuMult}
              onChange={(e) => setPredRuMult(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handleSavePredictionSettings()}
          disabled={predSaving}
          className={btnPrimary}
        >
          {predSaving ? 'Saving…' : 'Save prediction settings'}
        </button>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">Prediction bet history</h3>
        <p className="text-xs text-muted m-0 leading-relaxed">
          All website bets for a tournament — who staked how much on champion and runner-up picks.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[12rem] block space-y-1">
            <span className="text-xs text-slate-400">Tournament</span>
            <select
              className={selectClass}
              value={betHistoryTournamentId}
              onChange={(e) => setBetHistoryTournamentId(e.target.value)}
            >
              <option value="">Choose tournament…</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.slug}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadBetHistory()}
            disabled={betHistoryLoading || !betHistoryTournamentId}
            className={btnSecondary}
          >
            {betHistoryLoading ? 'Loading…' : 'Load bets'}
          </button>
          <button
            type="button"
            disabled={!predTournamentId}
            className={btnGhost}
            onClick={() => {
              if (predTournamentId) {
                setBetHistoryTournamentId(predTournamentId)
              }
            }}
          >
            Use active prediction tournament
          </button>
        </div>

        {betHistoryMeta ? (
          <p className="text-xs text-slate-300 m-0">
            <span className="font-medium text-[#f5efe6]">{betHistoryMeta.title}</span> —{' '}
            {betHistoryMeta.totalEntries} bet{betHistoryMeta.totalEntries === 1 ? '' : 's'},{' '}
            {betHistoryMeta.totalStaked.toLocaleString()} Asteryn Point total staked
          </p>
        ) : null}

        {(betHistoryChampSummary.length > 0 || betHistoryRuSummary.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {betHistoryChampSummary.length > 0 ? (
              <div className="rounded-xl border border-violet-500/25 bg-[#151524]/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-cyan-200/95 m-0">Champion — total staked per pick</p>
                <ul className="list-none m-0 p-0 space-y-1 text-sm">
                  {betHistoryChampSummary.map((s) => (
                    <li key={s.participantId} className="flex justify-between gap-2 text-slate-200">
                      <span>
                        #{s.seedRank} {s.displayName}{' '}
                        <span className="text-muted text-xs">({s.betCount})</span>
                      </span>
                      <span className="tabular-nums text-amber-200/90 shrink-0">
                        {s.totalStake.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {betHistoryRuSummary.length > 0 ? (
              <div className="rounded-xl border border-violet-500/25 bg-[#151524]/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-cyan-200/95 m-0">Runner-up — total staked per pick</p>
                <ul className="list-none m-0 p-0 space-y-1 text-sm">
                  {betHistoryRuSummary.map((s) => (
                    <li key={s.participantId} className="flex justify-between gap-2 text-slate-200">
                      <span>
                        #{s.seedRank} {s.displayName}{' '}
                        <span className="text-muted text-xs">({s.betCount})</span>
                      </span>
                      <span className="tabular-nums text-amber-200/90 shrink-0">
                        {s.totalStake.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {betHistoryMeta && betHistoryEntries.length === 0 ? (
          <p className="text-sm text-muted m-0">No bets for this tournament yet.</p>
        ) : null}

        {betHistoryEntries.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-violet-500/25">
            <table className="w-full text-left text-sm border-collapse min-w-[52rem]">
              <thead>
                <tr className="border-b border-violet-500/30 bg-[#151524]/80 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Champion pick</th>
                  <th className="px-3 py-2 font-medium text-right">Stake</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Runner-up pick</th>
                  <th className="px-3 py-2 font-medium text-right">Stake</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {betHistoryEntries.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-2 text-[#f5efe6] font-medium whitespace-nowrap">
                      {row.username}
                    </td>
                    <td className="px-3 py-2 text-slate-200">
                      {row.stakeChampion > 0 ? (row.pickChampionLabel ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                      {row.stakeChampion > 0 ? row.stakeChampion.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.stakeChampion > 0 ? (
                        <span
                          className={
                            row.resultChampion === 'won'
                              ? 'text-emerald-300'
                              : row.resultChampion === 'lost'
                                ? 'text-rose-300'
                                : 'text-slate-400'
                          }
                        >
                          {row.resultChampion}
                          {row.payoutChampion ? ` (+${row.payoutChampion.toLocaleString()})` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-200">
                      {row.stakeRunnerUp > 0 ? (row.pickRunnerUpLabel ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                      {row.stakeRunnerUp > 0 ? row.stakeRunnerUp.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.stakeRunnerUp > 0 ? (
                        <span
                          className={
                            row.resultRunnerUp === 'won'
                              ? 'text-emerald-300'
                              : row.resultRunnerUp === 'lost'
                                ? 'text-rose-300'
                                : 'text-slate-400'
                          }
                        >
                          {row.resultRunnerUp}
                          {row.payoutRunnerUp ? ` (+${row.payoutRunnerUp.toLocaleString()})` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[#f5efe6]">
                      {row.totalStake.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
          </section>
        </div>
      ) : null}

      {adminTab === 'bracket' && selectedId == null ? (
        <section className={panelClass}>
          <p className="text-sm text-muted m-0">
            Choose a tournament in the toolbar above to edit format, participants, and match winners.
          </p>
        </section>
      ) : null}

      {adminTab === 'bracket' && selectedId != null ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(300px,380px)_1fr] xl:items-start">
          <div className="space-y-4">
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">Tournament details</h3>
            <p className="text-xs text-muted m-0 leading-relaxed">
              Edit the public title, URL slug, and format line shown on the main site.
            </p>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-400">Title</span>
                <input
                  className={fieldClass}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Asteryn Cobblemon SMP Championship Season 1"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-400">URL slug</span>
                <input
                  className={fieldClass}
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="spring-2026"
                />
                <span className="text-[10px] text-muted">Used in /tournament/{editSlug.trim() || 'your-slug'}</span>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-400">Subtitle / format</span>
                <input
                  className={fieldClass}
                  value={editSubtitle}
                  onChange={(e) => setEditSubtitle(e.target.value)}
                  placeholder="National Dex OU Singles — Bo3"
                />
              </label>
              <button type="button" onClick={() => void handleSaveDetails()} className={btnPrimary}>
                Save name &amp; slug
              </button>
            </div>
          </section>
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">Bracket format</h3>
            <p className="text-xs text-muted m-0 leading-relaxed">
              Current: <strong className="text-slate-200">{bracketSizeLabel(loadedBracketSize)}</strong>.
              {loadedBracketSize === 8
                ? ' No qualifying matches — quarters use seeds 1–8 only.'
                : loadedBracketSize === 16
                  ? ' Round of 16 uses seeds 1–16; quarters pair adjacent R16 winners.'
                  : ' Seeds 5–12 play qualifiers; edit QF vs qual pairings below.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={loadedBracketSize === 12}
                onClick={() => handleSaveBracketSize(12)}
                className={btnSecondary}
              >
                Use 12-player bracket
              </button>
              <button
                type="button"
                disabled={loadedBracketSize === 8}
                onClick={() => handleSaveBracketSize(8)}
                className={btnSecondary}
              >
                Use 8-player bracket
              </button>
              <button
                type="button"
                disabled={loadedBracketSize === 16}
                onClick={() => handleSaveBracketSize(16)}
                className={btnSecondary}
              >
                Use 16-player bracket
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">Prizes</h3>
            <p className="text-xs text-muted m-0 leading-relaxed">
              One line per bullet — same list as on the public tournament page. Empty lines are ignored.
            </p>
            <textarea
              className={`${fieldClass} min-h-[140px]`}
              value={prizesDraft}
              onChange={(e) => setPrizesDraft(e.target.value)}
              placeholder={`${DEFAULT_PRIZES_LINES.join('\n')}`}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleSavePrizes} className={btnSecondary}>
                Save prizes
              </button>
              <button
                type="button"
                onClick={() => setPrizesDraft([...DEFAULT_PRIZES_LINES].join('\n'))}
                className={btnGhost}
              >
                Reset to defaults
              </button>
            </div>
          </section>

          {loadedBracketSize === 12 ? (
            <section className={panelClass}>
              <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">Quarter-final pairings</h3>
              <p className="text-xs text-muted m-0 leading-relaxed">
                For each quarter-final, pick which <strong className="text-slate-300">qualifier winner</strong>{' '}
                (Qualifier 1 = seeds 5 vs 12, …) plays that top seed. Each qualifier must appear once.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((qfIdx) => (
                  <label key={qfIdx} className="flex flex-col gap-2 text-xs text-muted">
                    <span>
                      <span className="text-cyan-200/90 font-medium">Quarter-final {qfIdx + 1}</span>
                      <span className="text-slate-400"> — top seed {qfIdx + 1} vs winner of</span>
                    </span>
                    <select
                      className={selectClass}
                      value={qfQualDraft[qfIdx]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setQfQualDraft((prev) => {
                          const next = [...prev] as [number, number, number, number]
                          next[qfIdx] = v
                          return next
                        })
                      }}
                    >
                      {[0, 1, 2, 3].map((qi) => (
                        <option key={qi} value={qi}>
                          Qualifier {qi + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {!qfDraftIsPermutation ? (
                <p className="text-xs text-cyan-300 m-0">Choose four different qualifiers (no duplicates).</p>
              ) : null}
              <button type="button" onClick={handleSaveQfPairings} disabled={!qfDraftIsPermutation} className={btnSecondary}>
                Save pairings
              </button>
            </section>
          ) : loadedBracketSize === 16 ? (
            <section className={panelClass}>
              <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">16-player round of 16</h3>
              <p className="text-xs text-muted m-0 leading-relaxed">
                Fixed pairings: 1 vs 16, 2 vs 15, 3 vs 14, 4 vs 13, 5 vs 12, 6 vs 11, 7 vs 10, 8 vs 9. Quarters pair
                winners of adjacent R16 matches. Enter participants for seeds 1–16.
              </p>
            </section>
          ) : (
            <section className={panelClass}>
              <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">8-player quarters</h3>
              <p className="text-xs text-muted m-0 leading-relaxed">
                Fixed pairings: QF1 = seed 1 vs 8, QF2 = 2 vs 7, QF3 = 3 vs 6, QF4 = 4 vs 5. Enter participants for seeds{' '}
                1–8 only.
              </p>
            </section>
          )}

          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase">
              Participant (seed 1–{loadedBracketSize})
            </h3>
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Seed
                <select
                  className={`${selectClass} w-auto min-w-[5rem]`}
                  value={Math.min(seedRank, loadedBracketSize)}
                  onChange={(e) => setSeedRank(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: loadedBracketSize }, (_, i) => i + 1).map((n) => {
                    const existing = participantAtSeed(participants, n)
                    return (
                      <option key={n} value={n}>
                        {n}
                        {existing ? ` — ${existing.display_name}` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
              {participantAtSeed(participants, seedRank) ? (
                <p className="text-xs text-emerald-300/90 m-0 pb-1">
                  Editing seed {seedRank} — {participantAtSeed(participants, seedRank)!.display_name}
                </p>
              ) : (
                <p className="text-xs text-muted m-0 pb-1">Seed {seedRank} — no participant saved yet</p>
              )}
            </div>
            <AdminUserSearchField
              value={displayName}
              onChange={setDisplayName}
              inputClassName={fieldClass}
              hint="Search registered website accounts (username = in-game name). Pick from the list or type manually for guests."
            />
            <textarea
              className={`${fieldClass} min-h-[180px] font-mono text-xs`}
              placeholder="Paste PokePaste / Showdown export here…"
              value={pokepaste}
              onChange={(e) => setPokepaste(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleParsePreview} className={btnGhost}>
                Preview parse{parsePreview != null ? ` (${parsePreview} Pokémon)` : ''}
              </button>
              <button type="button" onClick={handleSaveParticipant} className={btnPrimary}>
                Save participant
              </button>
            </div>
            {participants.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted w-full">Registered:</span>
                {[...participants]
                  .sort((a, b) => a.seed_rank - b.seed_rank)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSeedRank(p.seed_rank)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        p.seed_rank === seedRank
                          ? 'border-cyan-400/50 bg-cyan-950/40 text-cyan-100'
                          : 'border-violet-500/25 bg-[#121426]/55 text-slate-200 hover:border-violet-400/45 hover:bg-[#121426]/80'
                      }`}
                    >
                      <span className="text-cyan-300 font-medium">Seed {p.seed_rank}</span>
                      <span className="text-slate-500">·</span>
                      <span>{p.display_name}</span>
                    </button>
                  ))}
              </div>
            ) : null}
          </section>
          </div>

          <section
            className={`${cardClass} xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:flex xl:flex-col min-h-0`}
          >
            <h3 className="text-sm font-semibold text-cyan-200 m-0 tracking-wide uppercase shrink-0">
              Matches — pick winner
            </h3>
            {loading ? <p className="text-xs text-muted m-0 shrink-0">Loading bracket…</p> : null}
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1 mt-2 [scrollbar-color:rgba(129,140,248,0.35)_transparent]">
              {bracket.map((m) => {
                const winnerName =
                  m.winnerParticipantId != null
                    ? participants.find((p) => p.id === m.winnerParticipantId)?.display_name
                    : null
                return (
                  <article
                    key={m.key}
                    className="rounded-xl border border-violet-500/20 bg-[#141426]/80 p-4 space-y-3 text-sm hover:border-violet-400/35 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-400/25">
                        {roundPill(m.round)}
                      </span>
                      <span className="font-semibold text-[#f5efe6]">{m.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-slate-300">{slotLine(m.left)}</span>
                      <span className="text-slate-500">vs</span>
                      <span className="text-slate-300">{slotLine(m.right)}</span>
                    </p>
                    {m.winnerParticipantId != null ? (
                      <p className="text-xs text-emerald-300 m-0">
                        Winner: <strong className="font-semibold">{winnerName ?? 'Recorded'}</strong>
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {m.left.kind === 'participant' && m.left.id != null ? (
                        <button
                          type="button"
                          disabled={!m.canSetWinner}
                          onClick={() => setWinner(m.key, m.left.id!)}
                          className={btnWin}
                        >
                          Win: {m.left.name}
                        </button>
                      ) : null}
                      {m.right.kind === 'participant' && m.right.id != null ? (
                        <button
                          type="button"
                          disabled={!m.canSetWinner}
                          onClick={() => setWinner(m.key, m.right.id!)}
                          className={btnWin}
                        >
                          Win: {m.right.name}
                        </button>
                      ) : null}
                      {m.winnerParticipantId != null ? (
                        <button type="button" onClick={() => clearWinner(m.key)} className={btnClear}>
                          Clear winner
                        </button>
                      ) : null}
                    </div>
                    {!m.canSetWinner ? (
                      <p className="text-muted text-[11px] m-0">Not ready — both slots need a named player.</p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
