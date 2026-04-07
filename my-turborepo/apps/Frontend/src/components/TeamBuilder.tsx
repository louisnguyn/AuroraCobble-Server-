import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import {
  createSavedTeam,
  deleteSavedTeam,
  fetchSavedTeams,
  updateSavedTeam,
  type SavedTeamRow,
} from '../authApi'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from './AuthModal'
import {
  emptyTeamSlots,
  normalizeSlotMovesForForm,
  parsePokepaste,
  parsedPokemonToSlot,
  speciesDisplayToSlug,
  teamSlotsToPaste,
  type TeamBuildSlot,
} from '../pokepasteParse'
import { analyzeTeamWithAI, type TeamAnalysisLanguage } from '../api'
import {
  fetchAbilityList,
  fetchItemImage,
  fetchItemList,
  fetchMoveList,
  fetchPokemonInfo,
  fetchPokemonList,
  pokeApiItemSpriteCandidates,
  showdownHomeSpriteUrl,
  TERA_TYPE_OPTIONS,
  type AbilityListEntry,
  type ItemListEntry,
  type MoveListEntry,
  type PokemonListEntry,
} from '../pokemonApi'

function formatSpeciesLabel(apiSlug: string): string {
  return apiSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function emptySlot(): TeamBuildSlot {
  return { species: '', speciesSlug: '', item: '', ability: null, teraType: null, moves: [] }
}

function TeamBuilderPokeSprite({
  speciesSlug,
  className = 'w-16 h-16',
}: {
  speciesSlug: string
  className?: string
}) {
  const slug = speciesSlug.trim().toLowerCase()
  const [src, setSrc] = useState<string | null>(() => (slug ? showdownHomeSpriteUrl(slug) : null))
  const fallbackAttempted = useRef(false)

  useEffect(() => {
    fallbackAttempted.current = false
    if (!slug) {
      setSrc(null)
      return
    }
    setSrc(showdownHomeSpriteUrl(slug))
  }, [slug])

  if (!slug) {
    return <div className={`${className} rounded-lg bg-surface-hover shrink-0 mx-auto`} />
  }

  return (
    <img
      src={src ?? showdownHomeSpriteUrl(slug)}
      alt=""
      className={`${className} object-contain shrink-0 rounded-lg bg-surface-hover/50 mx-auto`}
      loading="lazy"
      onError={() => {
        if (fallbackAttempted.current) return
        fallbackAttempted.current = true
        void fetchPokemonInfo(slug).then((i) => {
          if (i?.image) setSrc(i.image)
        })
      }}
    />
  )
}

function TeamBuilderItemIcon({ itemName, className = 'w-7 h-7' }: { itemName: string; className?: string }) {
  const name = itemName.trim()
  const candidates = useMemo(() => (name ? pokeApiItemSpriteCandidates(name) : []), [name])
  const [src, setSrc] = useState('')
  const stepRef = useRef(0)

  useEffect(() => {
    stepRef.current = 0
    setSrc(candidates[0] ?? '')
  }, [name, candidates])

  if (!name) return null

  return (
    <img
      src={src || candidates[0] || ''}
      alt=""
      className={`${className} object-contain shrink-0`}
      loading="lazy"
      onError={() => {
        const i = stepRef.current
        const len = candidates.length
        if (len === 0) return
        if (i < len - 1) {
          stepRef.current = i + 1
          setSrc(candidates[i + 1]!)
          return
        }
        if (i === len - 1) {
          stepRef.current = i + 1
          void fetchItemImage(name).then((url) => {
            if (url) setSrc(url)
          })
        }
      }}
    />
  )
}

function SlotFormFields({
  draft,
  setDraft,
  speciesOptions,
  itemOptions,
  abilityOptions,
  moveOptions,
  slotNumber,
}: {
  draft: TeamBuildSlot
  setDraft: Dispatch<SetStateAction<TeamBuildSlot | null>>
  speciesOptions: PokemonListEntry[]
  itemOptions: ItemListEntry[]
  abilityOptions: AbilityListEntry[]
  moveOptions: MoveListEntry[]
  slotNumber: number
}) {
  const [m0, m1, m2, m3] = normalizeSlotMovesForForm(draft.moves)
  const speciesDatalistId = `tb-species-${slotNumber}`
  const itemDatalistId = `tb-item-${slotNumber}`
  const abilityDatalistId = `tb-ability-${slotNumber}`
  const teraDatalistId = `tb-tera-${slotNumber}`
  const moveDatalistId = `tb-moves-${slotNumber}`

  const patch = (partial: Partial<TeamBuildSlot>) =>
    setDraft((prev) => (prev ? { ...prev, ...partial } : null))

  const setMovesFromFour = (a: string, b: string, c: string, d: string) => {
    const moves = [a, b, c, d].map((x) => x.trim()).filter(Boolean)
    setDraft((prev) => (prev ? { ...prev, moves } : null))
  }

  return (
    <div className="pixel-panel-soft p-4 sm:p-5 space-y-3 border-2 border-accent/35 ring-1 ring-amber-900/30">
      <p className="text-sm font-semibold text-[#f5efe6] m-0">Edit slot {slotNumber}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs text-muted block mb-1">Species</label>
          <input
            type="text"
            value={draft.species}
            onChange={(e) => {
              const species = e.target.value
              patch({
                species,
                speciesSlug: species.trim() ? speciesDisplayToSlug(species) : '',
              })
            }}
            list={speciesDatalistId}
            placeholder="e.g. Great Tusk"
            className="w-full pixel-field px-2 py-2 text-sm"
            autoComplete="off"
          />
          <datalist id={speciesDatalistId}>
            {speciesOptions.map((p) => (
              <option key={p.id} value={formatSpeciesLabel(p.name)} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted block mb-1">Item</label>
          <input
            type="text"
            value={draft.item}
            onChange={(e) => patch({ item: e.target.value })}
            list={itemDatalistId}
            placeholder="Held item"
            className="w-full pixel-field px-2 py-2 text-sm"
            autoComplete="off"
          />
          <datalist id={itemDatalistId}>
            {itemOptions.map((it) => (
              <option key={it.name} value={formatSpeciesLabel(it.name)} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Ability</label>
          <input
            type="text"
            value={draft.ability ?? ''}
            onChange={(e) =>
              patch({ ability: e.target.value.trim() ? e.target.value : null })
            }
            list={abilityDatalistId}
            placeholder="e.g. Protosynthesis"
            className="w-full pixel-field px-2 py-2 text-sm"
            autoComplete="off"
          />
          <datalist id={abilityDatalistId}>
            {abilityOptions.map((a) => (
              <option key={a.name} value={formatSpeciesLabel(a.name)} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Tera Type</label>
          <input
            type="text"
            value={draft.teraType ?? ''}
            onChange={(e) =>
              patch({ teraType: e.target.value.trim() ? e.target.value : null })
            }
            list={teraDatalistId}
            placeholder="e.g. Ground"
            className="w-full pixel-field px-2 py-2 text-sm"
            autoComplete="off"
          />
          <datalist id={teraDatalistId}>
            {TERA_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted m-0 mb-1">Moves</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => (
            <input
              key={idx}
              type="text"
              value={[m0, m1, m2, m3][idx]}
              onChange={(e) => {
                const next = [m0, m1, m2, m3]
                next[idx] = e.target.value
                setMovesFromFour(next[0]!, next[1]!, next[2]!, next[3]!)
              }}
              list={moveDatalistId}
              placeholder={`Move ${idx + 1}`}
              className="w-full pixel-field px-2 py-2 text-sm"
              autoComplete="off"
            />
          ))}
        </div>
        <datalist id={moveDatalistId}>
          {moveOptions.map((m) => (
            <option key={m.name} value={formatSpeciesLabel(m.name)} />
          ))}
        </datalist>
      </div>
    </div>
  )
}

const aiAnalysisMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="text-lg font-semibold text-[#f5efe6] mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-base font-semibold text-[#f5efe6] mt-4 mb-2 first:mt-0 border-b border-border/35 pb-1">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold text-[#f5efe6] mt-3 mb-1.5">{children}</h4>
  ),
  p: ({ children }) => <p className="my-2 text-[#ede8df]/92 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 ml-4 list-disc space-y-1.5 text-[#ede8df]/92 marker:text-amber-200/70">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1.5 text-[#ede8df]/92 marker:text-amber-200/70">{children}</ol>
  ),
  li: ({ children }) => <li className="[&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#f5efe6]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#f8f4ec]">{children}</em>,
}

const TEAM_AI_LANG_STORAGE_KEY = 'aurora_team_ai_lang'

function readStoredTeamAiLang(): TeamAnalysisLanguage {
  try {
    return localStorage.getItem(TEAM_AI_LANG_STORAGE_KEY) === 'vi' ? 'vi' : 'en'
  } catch {
    return 'en'
  }
}

const EXAMPLE_PASTE = `Great Tusk @ Booster Energy
Ability: Protosynthesis
Tera Type: Ground
- Headlong Rush
- Close Combat
- Rapid Spin
- Ice Spinner`

function slotsFromSavedJson(raw: unknown): TeamBuildSlot[] {
  if (!Array.isArray(raw)) return emptyTeamSlots()
  const base = emptyTeamSlots()
  for (let i = 0; i < 6; i++) {
    const el = raw[i] as Record<string, unknown> | undefined
    if (!el || typeof el !== 'object') continue
    const species = typeof el.species === 'string' ? el.species : ''
    let speciesSlug = typeof el.speciesSlug === 'string' ? el.speciesSlug : ''
    if (species.trim() && !speciesSlug.trim()) speciesSlug = speciesDisplayToSlug(species)
    base[i] = {
      species,
      speciesSlug,
      item: typeof el.item === 'string' ? el.item : '',
      ability: typeof el.ability === 'string' ? el.ability : null,
      teraType: typeof el.teraType === 'string' ? el.teraType : null,
      moves: Array.isArray(el.moves)
        ? el.moves.filter((m): m is string => typeof m === 'string')
        : [],
    }
  }
  return base
}

function formatTeamAiCooldownMessage(lang: TeamAnalysisLanguage, nextIso?: string): string {
  if (lang === 'vi') {
    if (nextIso) {
      try {
        const d = new Date(nextIso)
        if (!Number.isNaN(d.getTime())) {
          return `Bạn chỉ dùng phân tích AI tối đa 1 lần / 48 giờ. Lần tiếp theo: ${d.toLocaleString('vi-VN')}.`
        }
      } catch {
        /* ignore */
      }
    }
    return 'Bạn chỉ dùng phân tích AI tối đa 1 lần mỗi 48 giờ.'
  }
  if (nextIso) {
    try {
      const d = new Date(nextIso)
      if (!Number.isNaN(d.getTime())) {
        return `You can use Team AI analysis at most once every 48 hours. Next available: ${d.toLocaleString()}.`
      }
    } catch {
      /* ignore */
    }
  }
  return 'You can use Team AI analysis at most once every 48 hours.'
}

export function TeamBuilder() {
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const isAdminUser = Boolean(user?.is_admin)
  const [slots, setSlots] = useState<TeamBuildSlot[]>(() => emptyTeamSlots())
  const [pasteImport, setPasteImport] = useState('')
  const [teamName, setTeamName] = useState('')
  const [savedTeamRowId, setSavedTeamRowId] = useState<number | null>(null)
  const [savedList, setSavedList] = useState<SavedTeamRow[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLang, setAiLang] = useState<TeamAnalysisLanguage>(() => readStoredTeamAiLang())

  const persistAiLang = (lang: TeamAnalysisLanguage) => {
    setAiLang(lang)
    try {
      localStorage.setItem(TEAM_AI_LANG_STORAGE_KEY, lang)
    } catch {
      /* ignore quota / private mode */
    }
  }
  const [formError, setFormError] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [speciesOptions, setSpeciesOptions] = useState<PokemonListEntry[]>([])
  const [itemOptions, setItemOptions] = useState<ItemListEntry[]>([])
  const [abilityOptions, setAbilityOptions] = useState<AbilityListEntry[]>([])
  const [moveOptions, setMoveOptions] = useState<MoveListEntry[]>([])
  /** Which slot (0–5) is being edited; null = form hidden */
  const [formSlotIndex, setFormSlotIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<TeamBuildSlot | null>(null)

  const closeForm = useCallback(() => {
    setFormSlotIndex(null)
    setDraft(null)
    setFormError(null)
  }, [])

  const openSlotForm = useCallback(
    (i: number) => {
      const s = slots[i]!
      setFormSlotIndex(i)
      setFormError(null)
      setDraft(
        s.species.trim()
          ? { ...s, moves: [...s.moves] }
          : emptySlot(),
      )
    },
    [slots],
  )

  useEffect(() => {
    let cancelled = false
    fetchPokemonList(1025)
      .then((list) => {
        if (!cancelled) setSpeciesOptions(list)
      })
      .catch(() => {})
    fetchItemList()
      .then((list) => {
        if (!cancelled) setItemOptions(list)
      })
      .catch(() => {})
    fetchAbilityList()
      .then((list) => {
        if (!cancelled) setAbilityOptions(list)
      })
      .catch(() => {})
    fetchMoveList()
      .then((list) => {
        if (!cancelled) setMoveOptions(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const refreshSaved = useCallback(async () => {
    if (!isAuthenticated) {
      setSavedList([])
      return
    }
    setSavedLoading(true)
    try {
      const { teams } = await fetchSavedTeams()
      setSavedList(teams)
    } catch {
      setSavedList([])
    } finally {
      setSavedLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    void refreshSaved()
  }, [authLoading, refreshSaved])

  const clearSlotAt = useCallback((i: number) => {
    setSlots((prev) => {
      const next = [...prev]
      next[i] = emptySlot()
      return next
    })
    if (formSlotIndex === i) closeForm()
  }, [formSlotIndex, closeForm])

  const applyDraftToSlot = useCallback(() => {
    if (formSlotIndex === null || !draft) return
    if (!draft.species.trim()) {
      setFormError('Species is required.')
      return
    }
    const speciesSlug = draft.speciesSlug.trim() || speciesDisplayToSlug(draft.species)
    setSlots((prev) => {
      const next = [...prev]
      next[formSlotIndex] = { ...draft, speciesSlug }
      return next
    })
    closeForm()
  }, [formSlotIndex, draft, closeForm])

  const importPaste = useCallback(() => {
    const parsed = parsePokepaste(pasteImport)
    const next = emptyTeamSlots()
    parsed.slice(0, 6).forEach((p, i) => {
      next[i] = parsedPokemonToSlot(p)
    })
    setSlots(next)
    closeForm()
    setSavedTeamRowId(null)
    setAiAnalysis(null)
    setAiError(null)
    setSaveOk(parsed.length ? `Imported ${Math.min(parsed.length, 6)} Pokémon into slots.` : null)
    setTimeout(() => setSaveOk(null), 3000)
  }, [pasteImport, closeForm])

  const exportPaste = useCallback(async () => {
    const text = teamSlotsToPaste(slots)
    try {
      await navigator.clipboard.writeText(text)
      setSaveOk('Paste copied to clipboard.')
    } catch {
      setSaveOk(null)
    }
    setTimeout(() => setSaveOk(null), 2500)
  }, [slots])

  const runTeamAnalyseByAi = useCallback(async () => {
    if (!isAuthenticated) {
      setAiError(
        aiLang === 'vi'
          ? 'Đăng nhập để dùng phân tích AI (tài khoản thường: 1 lần / 48 giờ).'
          : 'Log in to use AI team analysis (standard accounts: once per 48 hours).',
      )
      setAiAnalysis(null)
      setShowAuth(true)
      return
    }
    const paste = teamSlotsToPaste(slots)
    if (!paste.trim()) {
      setAiError(
        aiLang === 'vi'
          ? 'Thêm ít nhất một Pokémon trước khi chạy phân tích AI.'
          : 'Add at least one Pokémon before running AI analysis.',
      )
      setAiAnalysis(null)
      return
    }
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)
    try {
      const { analysis } = await analyzeTeamWithAI(paste, { language: aiLang })
      setAiAnalysis(analysis)
    } catch (e) {
      if (e instanceof Error && e.message === 'TEAM_AI_COOLDOWN') {
        const next = (e as Error & { nextAllowedAt?: string }).nextAllowedAt
        setAiError(formatTeamAiCooldownMessage(aiLang, next))
      } else if (e instanceof Error && e.message === 'LOGIN_REQUIRED') {
        setAiError(
          aiLang === 'vi' ? 'Phiên đăng nhập hết hạn. Đăng nhập lại.' : 'Session expired. Please log in again.',
        )
        setShowAuth(true)
      } else {
        setAiError(
          e instanceof Error ? e.message : aiLang === 'vi' ? 'Phân tích thất bại.' : 'Analysis failed.',
        )
      }
    } finally {
      setAiLoading(false)
    }
  }, [slots, aiLang, isAuthenticated])

  const handleSave = async () => {
    setSaveError(null)
    setSaveOk(null)
    if (!isAuthenticated) {
      setShowAuth(true)
      return
    }
    const name = teamName.trim()
    if (!name) {
      setSaveError('Enter a team name to save.')
      return
    }
    try {
      const aiPayload = aiAnalysis?.trim() ? aiAnalysis : null
      if (savedTeamRowId != null) {
        const { team } = await updateSavedTeam(savedTeamRowId, {
          name,
          team: slots,
          ai_analysis: aiPayload,
        })
        setSavedTeamRowId(team.id)
        setAiAnalysis(team.ai_analysis?.trim() ? team.ai_analysis : null)
        setSaveOk('Team updated.')
      } else {
        const { team } = await createSavedTeam({
          name,
          team: slots,
          ai_analysis: aiPayload,
        })
        setSavedTeamRowId(team.id)
        setAiAnalysis(team.ai_analysis?.trim() ? team.ai_analysis : null)
        setSaveOk('Team saved.')
      }
      await refreshSaved()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const loadTeam = (row: SavedTeamRow) => {
    setSlots(slotsFromSavedJson(row.team_json))
    setTeamName(row.name)
    setSavedTeamRowId(row.id)
    closeForm()
    setSaveOk(null)
    setSaveError(null)
    setAiError(null)
    setAiAnalysis(row.ai_analysis?.trim() ? row.ai_analysis : null)
  }

  const copySavedTeamPokepaste = useCallback(async (row: SavedTeamRow) => {
    const text = teamSlotsToPaste(slotsFromSavedJson(row.team_json))
    try {
      await navigator.clipboard.writeText(text)
      setSaveOk(`"${row.name}" pokepaste copied.`)
    } catch {
      setSaveOk('Could not copy to clipboard.')
    }
    setTimeout(() => setSaveOk(null), 2500)
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this saved team?')) return
    try {
      await deleteSavedTeam(id)
      if (savedTeamRowId === id) {
        setSavedTeamRowId(null)
        setTeamName('')
        setSlots(emptyTeamSlots())
        setAiAnalysis(null)
        setAiError(null)
      }
      await refreshSaved()
      closeForm()
      setSaveOk('Team deleted.')
      setTimeout(() => setSaveOk(null), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const newTeam = () => {
    setSlots(emptyTeamSlots())
    setTeamName('')
    setSavedTeamRowId(null)
    setPasteImport('')
    setSaveError(null)
    setSaveOk(null)
    setAiAnalysis(null)
    setAiError(null)
    closeForm()
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold m-0 text-[#f5efe6]">Team Builder</h1>
        <p className="text-sm text-muted m-0 mt-2 max-w-2xl">
          Tap <span className="text-[#f5efe6]">+</span> on an empty slot to add a Pokémon. Filled slots
          show sprite and item. Log in to save teams to your account.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={newTeam} className="pixel-btn text-sm py-2 px-3">
          New team
        </button>
        <button type="button" onClick={exportPaste} className="pixel-btn text-sm py-2 px-3">
          Copy current team
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tb-ai-lang" className="text-xs text-muted whitespace-nowrap m-0">
            AI language / Ngôn ngữ
          </label>
          <select
            id="tb-ai-lang"
            value={aiLang}
            onChange={(e) => persistAiLang(e.target.value === 'vi' ? 'vi' : 'en')}
            disabled={aiLoading}
            className="pixel-field text-sm py-1.5 px-2 min-w-[9rem] disabled:opacity-60"
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void runTeamAnalyseByAi()}
          disabled={aiLoading}
          className="pixel-btn-primary text-sm py-2 px-3 disabled:opacity-60"
        >
          {aiLoading
            ? aiLang === 'vi'
              ? 'Đang phân tích…'
              : 'Analysing…'
            : aiLang === 'vi'
              ? 'Phân tích đội (AI)'
              : 'Team analyse by AI'}
        </button>
      </div>

      {!authLoading ? (
        <p className="text-[11px] text-muted m-0 max-w-2xl">
          {!isAuthenticated ? (
            aiLang === 'vi' ? (
              <>
                Phân tích AI cần <span className="text-[#f5efe6]/90">đăng nhập</span>. Tài khoản thường: tối đa{' '}
                <span className="text-[#f5efe6]/90">1 lần / 48 giờ</span>.
              </>
            ) : (
              <>
                AI analysis requires <span className="text-[#f5efe6]/90">logging in</span>. Standard accounts:{' '}
                <span className="text-[#f5efe6]/90">once per 48 hours</span>.
              </>
            )
          ) : isAdminUser ? (
            aiLang === 'vi' ? (
              <>
                Tài khoản quản trị: <span className="text-[#f5efe6]/90">không giới hạn</span> số lần phân tích AI.
              </>
            ) : (
              <>
                Admin account: <span className="text-[#f5efe6]/90">no limit</span> on AI analyses.
              </>
            )
          ) : aiLang === 'vi' ? (
            <>
              Tài khoản thường: tối đa <span className="text-[#f5efe6]/90">1 lần phân tích AI mỗi 48 giờ</span>.
            </>
          ) : (
            <>
              Standard account: <span className="text-[#f5efe6]/90">one AI analysis every 48 hours</span>.
            </>
          )}
        </p>
      ) : null}

      {isAuthenticated && (
        <div className="pixel-panel-soft p-4 space-y-3">
          <h2 className="text-base font-semibold text-[#f5efe6] m-0">Saved teams</h2>
          {savedLoading ? (
            <p className="text-sm text-muted m-0">Loading…</p>
          ) : savedList.length === 0 ? (
            <p className="text-sm text-muted m-0">No saved teams yet. Save one below.</p>
          ) : (
            <ul className="list-none m-0 p-0 space-y-2">
              {savedList.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 py-2 border-b border-border/30 last:border-0"
                >
                  <span className="text-sm text-[#f5efe6] font-medium flex-1 min-w-[8rem]">{t.name}</span>
                  <span className="text-xs text-muted">
                    {new Date(t.updated_at).toLocaleString()}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="pixel-btn text-xs py-1.5 px-2"
                      onClick={() => loadTeam(t)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="pixel-btn-primary text-xs py-1.5 px-2"
                      onClick={() => void copySavedTeamPokepaste(t)}
                    >
                      Copy pokepaste
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300 py-1.5 px-2"
                    onClick={() => void handleDelete(t.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(aiError || aiAnalysis) && (
        <div className="pixel-panel-soft p-4 space-y-2 border-2 border-accent/25">
          <h2 className="text-base font-semibold text-[#f5efe6] m-0">
            {aiLang === 'vi' ? 'Phân tích đội (AI)' : 'AI team analysis'}
          </h2>
          <p className="text-[11px] text-muted m-0">
            {aiLang === 'vi'
              ? 'Nội dung do AI tạo, có thể sai. Đội hình chỉ được gửi lên server cho một lần phân tích này.'
              : 'Suggestions are AI-generated and may be wrong. Your team is sent to the server for this request only.'}
          </p>
          {aiError ? <p className="text-sm text-red-400 m-0">{aiError}</p> : null}
          {aiAnalysis ? (
            <div className="mt-2 rounded-lg bg-surface-hover/40 border border-border/40 p-3 text-sm max-h-[min(28rem,55vh)] overflow-y-auto font-sans leading-relaxed [&>*:first-child]:mt-0">
              <ReactMarkdown components={aiAnalysisMarkdownComponents}>{aiAnalysis}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="paste-import" className="text-sm font-medium text-[#f5efe6]">
          Import paste (optional)
        </label>
        <textarea
          id="paste-import"
          value={pasteImport}
          onChange={(e) => setPasteImport(e.target.value)}
          placeholder={EXAMPLE_PASTE}
          rows={8}
          className="w-full pixel-field px-3 py-3 text-sm font-mono text-[#f5efe6] placeholder:text-muted/50 resize-y min-h-[120px]"
          spellCheck={false}
        />
        <button type="button" onClick={importPaste} className="pixel-btn-primary text-sm py-2 px-4">
          Apply paste to slots
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#f5efe6] m-0">Team preview</h2>
        <p className="text-xs text-muted m-0">
          Six slots — empty slots show a plus. Click a filled slot to edit moves, ability, or item.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {slots.map((slot, i) => {
            const filled = Boolean(slot.species.trim())
            return (
              <div
                key={i}
                className={`pixel-panel-soft min-h-[11rem] flex flex-col p-3 border transition-colors ${
                  formSlotIndex === i
                    ? 'border-accent/70 bg-surface-hover/30'
                    : 'border-border/50'
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted m-0 mb-2 text-center">
                  Slot {i + 1}
                </p>
                {!filled ? (
                  <button
                    type="button"
                    onClick={() => openSlotForm(i)}
                    className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/70 hover:border-accent/55 hover:bg-surface-hover/40 text-muted hover:text-[#f5efe6] transition-colors min-h-[9rem]"
                  >
                    <span className="text-3xl font-light text-accent leading-none" aria-hidden>
                      +
                    </span>
                    <span className="text-xs font-medium">Add Pokémon</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openSlotForm(i)}
                      className="flex-1 flex flex-col items-center text-center gap-1.5 rounded-lg hover:bg-surface-hover/50 p-1 -m-1 transition-colors w-full"
                    >
                      <TeamBuilderPokeSprite
                        speciesSlug={slot.speciesSlug || speciesDisplayToSlug(slot.species)}
                        className="w-14 h-14 sm:w-16 sm:h-16"
                      />
                      <span className="text-sm font-semibold text-[#f5efe6] leading-tight line-clamp-2 px-0.5">
                        {slot.species.trim()}
                      </span>
                      <div className="flex items-center justify-center gap-1.5 max-w-full px-1 min-h-[1.5rem]">
                        {slot.item.trim() ? (
                          <>
                            <TeamBuilderItemIcon itemName={slot.item} className="w-6 h-6 shrink-0" />
                            <span className="text-xs text-amber-200/90 truncate">{slot.item}</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted">No item</span>
                        )}
                      </div>
                    </button>
                    <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-border/30">
                      <button
                        type="button"
                        className="text-[11px] text-accent hover:underline"
                        onClick={() => openSlotForm(i)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-red-400/90 hover:underline"
                        onClick={() => clearSlotAt(i)}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {formSlotIndex !== null && draft ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-[#f5efe6] m-0">Add / edit Pokémon</h3>
          {formError ? <p className="text-sm text-red-400 m-0">{formError}</p> : null}
          <SlotFormFields
            draft={draft}
            setDraft={setDraft}
            speciesOptions={speciesOptions}
            itemOptions={itemOptions}
            abilityOptions={abilityOptions}
            moveOptions={moveOptions}
            slotNumber={formSlotIndex + 1}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={applyDraftToSlot} className="pixel-btn-primary text-sm py-2 px-4">
              Save to slot
            </button>
            <button type="button" onClick={closeForm} className="pixel-btn text-sm py-2 px-4">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <div className="pixel-panel-soft p-4 space-y-3">
        <h2 className="text-base font-semibold text-[#f5efe6] m-0">
          {savedTeamRowId != null ? 'Update saved team' : 'Save team'}
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor="team-save-name" className="text-xs text-muted block mb-1">
              Team name
            </label>
            <input
              id="team-save-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="My OU squad"
              className="w-full pixel-field px-3 py-2 text-sm"
              maxLength={120}
            />
          </div>
          <button type="button" onClick={() => void handleSave()} className="pixel-btn-primary py-2 px-4">
            {savedTeamRowId != null ? 'Save changes' : 'Save to account'}
          </button>
        </div>
        {isAuthenticated ? (
          <p className="text-xs text-muted m-0">
            {aiLang === 'vi'
              ? 'Bản phân tích AI mới nhất được lưu khi bạn bấm Lưu (và hiện lại khi tải đội này).'
              : 'The latest AI analysis text is stored when you save (and shown again when you load this team).'}
          </p>
        ) : null}
        {!isAuthenticated && (
          <p className="text-xs text-muted m-0">
            Log in to store teams on your account. You can still build and copy paste without logging in.
          </p>
        )}
        {saveError && <p className="text-sm text-red-400 m-0">{saveError}</p>}
        {saveOk && <p className="text-sm text-emerald-400/90 m-0">{saveOk}</p>}
      </div>
    </div>
  )
}
