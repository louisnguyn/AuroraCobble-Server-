import { useCallback, useEffect, useState } from 'react'
import {
  adminClearMatchWinner,
  adminCreateTournament,
  adminFetchBracket,
  adminListTournaments,
  adminParsePokepaste,
  adminPatchTournament,
  adminSetMatchWinner,
  adminUpsertParticipant,
  type TournamentBracketMatch,
  type TournamentBracketSlot,
} from '../authApi'
import { formatBracketMatchKeyLabel } from '../bracketLabels'

type TRow = { id: number; slug: string; title: string; is_published?: boolean }

type ParticipantSummary = { id: number; seed_rank: number; display_name: string }

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
  'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141210]'

const btnPrimary = `${btnBase} px-4 py-2.5 text-sm bg-amber-600 text-white border border-amber-500 shadow-md shadow-amber-950/35 hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-900/45`
const btnSecondary = `${btnBase} px-3 py-2 text-sm border border-stone-400/45 bg-stone-950/50 text-stone-100 hover:bg-stone-900/55 hover:border-stone-300/55 hover:shadow-md hover:shadow-stone-950/30`
const btnGhost = `${btnBase} px-3 py-2 text-sm border border-white/12 bg-white/[0.06] text-slate-200 hover:bg-white/12 hover:border-white/22`
const btnSuccess = `${btnBase} px-3 py-2 text-xs border border-emerald-500/45 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/45 hover:border-emerald-400/60`
const btnMuted = `${btnBase} px-3 py-2 text-xs border border-slate-500/35 bg-slate-900/40 text-slate-300 hover:bg-slate-800/55 hover:border-slate-400/40`
const btnWin = `${btnBase} px-3 py-2 text-xs border border-amber-400/35 bg-amber-950/35 text-amber-100 hover:bg-amber-900/45 hover:border-accent/50 disabled:hover:bg-amber-950/35`
const btnClear = `${btnBase} px-3 py-2 text-xs border border-amber-500/40 bg-amber-950/25 text-amber-100 hover:bg-amber-900/35`

const fieldClass =
  'w-full rounded-xl border border-stone-500/30 bg-[#1f1c18]/90 px-3 py-2.5 text-sm text-[#f5efe6] placeholder:text-slate-500 transition-colors hover:border-stone-400/45 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/25 outline-none'

const cardClass =
  'rounded-2xl border border-stone-500/25 bg-stone-950/25 backdrop-blur-sm p-5 space-y-4 shadow-lg shadow-black/25'

function slotLine(slot: TournamentBracketSlot): string {
  if (slot.kind === 'participant') return slot.name ?? '—'
  if (slot.kind === 'winner_of' && slot.matchKey) return formatBracketMatchKeyLabel(slot.matchKey)
  if (slot.kind === 'loser_of' && slot.matchKey)
    return `Loser of ${formatBracketMatchKeyLabel(slot.matchKey)}`
  return 'TBD'
}

function roundPill(round: TournamentBracketMatch['round']): string {
  const labels: Record<TournamentBracketMatch['round'], string> = {
    qualifying: 'Qualifier',
    quarter: 'Quarter-final',
    semi: 'Semi-final',
    final: 'Final',
    third: '3rd place',
  }
  return labels[round]
}

export function TournamentAdmin() {
  const [tournaments, setTournaments] = useState<TRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [bracket, setBracket] = useState<TournamentBracketMatch[]>([])
  const [participants, setParticipants] = useState<ParticipantSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [newSlug, setNewSlug] = useState('championship-s1')
  const [newTitle, setNewTitle] = useState('AuroraCobble Championship Season 1')
  const [newSubtitle, setNewSubtitle] = useState('National Dex OU Singles — Bo3')

  const [seedRank, setSeedRank] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [pokepaste, setPokepaste] = useState('')
  const [parsePreview, setParsePreview] = useState<number | null>(null)
  const [qfQualDraft, setQfQualDraft] = useState<[number, number, number, number]>([...DEFAULT_QF_FEED])
  const [prizesDraft, setPrizesDraft] = useState('')

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
        const t = r.tournament as { qf_qual_feed?: unknown; prizes?: unknown } | undefined
        setQfQualDraft(parseQfDraft(t?.qf_qual_feed))
        setPrizesDraft(prizesToDraft(t?.prizes))
        setParticipants(
          (r.participants as { id: number; seed_rank: number; display_name: string }[]).map((p) => ({
            id: p.id,
            seed_rank: p.seed_rank,
            display_name: p.display_name,
          }))
        )
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Bracket failed'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  useEffect(() => {
    if (selectedId != null) loadBracket(selectedId)
  }, [selectedId, loadBracket])

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

  const selectClass =
    'w-full rounded-xl border border-stone-500/30 bg-[#1f1c18]/90 px-3 py-2.5 text-sm text-[#f5efe6] transition-colors hover:border-stone-400/45 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/25 outline-none'

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 text-left">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-white m-0 bg-gradient-to-r from-white via-amber-100 to-stone-200 bg-clip-text text-transparent">
          Tournaments
        </h2>
        <p className="text-sm text-muted m-0 leading-relaxed">
          Create brackets, add 12 seeds with PokePaste, publish for the public site, then record winners. Flow:
          qualifiers (seeds 5–12) → quarter-finals with seeds 1–4 → semis → final and 3rd place.
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

      <section className={cardClass}>
        <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">New tournament</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={fieldClass} placeholder="URL slug (e.g. spring-2026)" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
          <div className="sm:col-span-2 space-y-3">
            <input className={fieldClass} placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <input className={fieldClass} placeholder="Subtitle / format" value={newSubtitle} onChange={(e) => setNewSubtitle(e.target.value)} />
          </div>
        </div>
        <button type="button" onClick={handleCreate} className={btnPrimary}>
          Create tournament
        </button>
      </section>

      <section className={cardClass}>
        <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">Select tournament</h3>
        <select
          className={selectClass}
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value, 10) : null)}
        >
          <option value="">Choose one…</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} · {t.slug} {t.is_published ? '· live' : '· draft'}
            </option>
          ))}
        </select>
        {selectedId != null ? (
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={() => handlePublish(true)} className={btnSuccess}>
              Publish (main site)
            </button>
            <button type="button" onClick={() => handlePublish(false)} className={btnMuted}>
              Unpublish
            </button>
          </div>
        ) : null}
      </section>

      {selectedId != null ? (
        <>
          <section className={cardClass}>
            <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">Prizes</h3>
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

          <section className={cardClass}>
            <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">Quarter-final pairings</h3>
            <p className="text-xs text-muted m-0 leading-relaxed">
              For each quarter-final, pick which <strong className="text-slate-300">qualifier winner</strong> (Qualifier 1 =
              seeds 5 vs 12, …) plays that top seed. Each qualifier must appear once.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((qfIdx) => (
                <label key={qfIdx} className="flex flex-col gap-2 text-xs text-muted">
                  <span>
                    <span className="text-amber-200/90 font-medium">Quarter-final {qfIdx + 1}</span>
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
              <p className="text-xs text-amber-300 m-0">Choose four different qualifiers (no duplicates).</p>
            ) : null}
            <button type="button" onClick={handleSaveQfPairings} disabled={!qfDraftIsPermutation} className={btnSecondary}>
              Save pairings
            </button>
          </section>

          <section className={cardClass}>
            <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">Participant (seed 1–12)</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1.5 text-xs text-muted">
                Seed
                <select
                  className={`${selectClass} w-auto min-w-[5rem]`}
                  value={seedRank}
                  onChange={(e) => setSeedRank(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              className={fieldClass}
              placeholder="Display name (IGN)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-500/25 bg-stone-950/40 px-2.5 py-1 text-xs text-slate-200"
                    >
                      <span className="text-amber-300 font-medium">Seed {p.seed_rank}</span>
                      <span className="text-slate-500">·</span>
                      <span>{p.display_name}</span>
                    </span>
                  ))}
              </div>
            ) : null}
          </section>

          <section className={cardClass}>
            <h3 className="text-sm font-semibold text-amber-200 m-0 tracking-wide uppercase">Matches — pick winner</h3>
            {loading ? <p className="text-xs text-muted m-0">Loading bracket…</p> : null}
            <div className="space-y-3 max-h-[min(70vh,36rem)] overflow-y-auto pr-1 [scrollbar-color:rgba(129,140,248,0.35)_transparent]">
              {bracket.map((m) => {
                const winnerName =
                  m.winnerParticipantId != null
                    ? participants.find((p) => p.id === m.winnerParticipantId)?.display_name
                    : null
                return (
                  <article
                    key={m.key}
                    className="rounded-xl border border-stone-500/20 bg-[#1a1814]/80 p-4 space-y-3 text-sm hover:border-stone-400/35 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-400/25">
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
        </>
      ) : null}
    </div>
  )
}
