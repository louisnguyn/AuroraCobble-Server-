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
  toShowdownSpeciesName,
  type TeamBuildSlot,
} from '../pokepasteParse'
import { analyzeTeamWithAI, createTeamPokepasteLink, type TeamAnalysisLanguage } from '../api'
import {
  fetchAbilityList,
  fetchItemImage,
  fetchItemList,
  fetchMoveList,
  fetchPokemonList,
  pokeApiItemSpriteCandidates,
  TERA_TYPE_OPTIONS,
  type AbilityListEntry,
  type ItemListEntry,
  type MoveListEntry,
  type PokemonListEntry,
} from '../pokemonApi'
import { CustomSelect } from './CustomSelect'
import { PokemonSprite } from './PokemonSprite.tsx'
import { PageEmptyState, PageHeader, PageNotice, PageSection, PageShell } from './PageLayout.tsx'
import { saveTeamPasteView } from '../teamPasteViewStorage.ts'

function formatResourceLabel(apiSlug: string): string {
  return apiSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatPokemonLabel(apiSlug: string): string {
  return toShowdownSpeciesName(apiSlug, apiSlug)
}

function emptySlot(): TeamBuildSlot {
  return { species: '', speciesSlug: '', item: '', ability: null, teraType: null, moves: [] }
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

function AutoCompleteField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!q) return options.slice(0, 10)
    const starts = options.filter((o) => o.toLowerCase().startsWith(q))
    const includes = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q))
    return [...starts, ...includes].slice(0, 10)
  }, [options, q])

  return (
    <div className={`relative ${className}`}>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        placeholder={placeholder}
        className="w-full pixel-field px-2 py-2 text-sm"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-40 mt-1 w-full max-h-48 overflow-y-auto rounded-[10px] border border-border/70 bg-[#121120] shadow-[0_14px_28px_rgba(3,3,10,0.6)] p-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-2 py-1.5 rounded text-sm text-[#dcd8f3] hover:bg-[#2a2740] hover:text-[#f2f0ff]"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(s)
                setOpen(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
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

  const patch = (partial: Partial<TeamBuildSlot>) =>
    setDraft((prev) => (prev ? { ...prev, ...partial } : null))

  const setMovesFromFour = (a: string, b: string, c: string, d: string) => {
    const moves = [a, b, c, d].map((x) => x.trim()).filter(Boolean)
    setDraft((prev) => (prev ? { ...prev, moves } : null))
  }

  return (
    <div className="pixel-panel-soft p-4 sm:p-5 space-y-4 border-2 border-accent/30 bg-gradient-to-br from-amber-950/15 to-[#0f0a1a]/80 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
        <p className="text-sm font-semibold text-[#f5efe6] m-0">Edit slot {slotNumber}</p>
        {draft.species.trim() ? (
          <span className="text-xs text-muted truncate max-w-[50%]">{draft.species.trim()}</span>
        ) : null}
      </div>
      {draft.species.trim() ? (
        <div className="flex justify-center py-2">
          <div className="rounded-2xl border border-border/50 bg-[#0f0a1a]/60 p-3 shadow-inner">
            <PokemonSprite
              speciesSlug={draft.speciesSlug}
              speciesDisplay={draft.species}
              className="w-20 h-20 sm:w-24 sm:h-24"
            />
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <AutoCompleteField
            label="Species"
            value={draft.species}
            onChange={(species) =>
              patch({
                species,
                speciesSlug: species.trim() ? speciesDisplayToSlug(species) : '',
              })
            }
            options={speciesOptions.map((p) => formatPokemonLabel(p.name))}
            placeholder="e.g. Great Tusk"
          />
        </div>
        <div className="sm:col-span-2">
          <AutoCompleteField
            label="Item"
            value={draft.item}
            onChange={(item) => patch({ item })}
            options={itemOptions.map((it) => formatResourceLabel(it.name))}
            placeholder="Held item"
          />
        </div>
        <div>
          <AutoCompleteField
            label="Ability"
            value={draft.ability ?? ''}
            onChange={(ability) =>
              patch({ ability: ability.trim() ? ability : null })
            }
            options={abilityOptions.map((a) => formatResourceLabel(a.name))}
            placeholder="e.g. Protosynthesis"
          />
        </div>
        <div>
          <AutoCompleteField
            label="Tera Type"
            value={draft.teraType ?? ''}
            onChange={(teraType) =>
              patch({ teraType: teraType.trim() ? teraType : null })
            }
            options={[...TERA_TYPE_OPTIONS]}
            placeholder="e.g. Ground"
          />
        </div>
      </div>
      <div>
        <p className="text-xs text-muted m-0 mb-1">Moves</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => {
            const currentVal = [m0, m1, m2, m3][idx] ?? ''
            return (
              <AutoCompleteField
              key={idx}
              label={`Move ${idx + 1}`}
              value={currentVal}
              onChange={(nextVal) => {
                const next = [m0, m1, m2, m3]
                next[idx] = nextVal
                setMovesFromFour(next[0]!, next[1]!, next[2]!, next[3]!)
              }}
              placeholder={`Move ${idx + 1}`}
              options={moveOptions.map((m) => formatResourceLabel(m.name))}
            />
            )
          })}
        </div>
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
          return `Bạn chỉ dùng phân tích AI tối đa 1 lần / 12 giờ. Lần tiếp theo: ${d.toLocaleString('vi-VN')}.`
        }
      } catch {
        /* ignore */
      }
    }
    return 'Bạn chỉ dùng phân tích AI tối đa 1 lần mỗi 12 giờ.'
  }
  if (nextIso) {
    try {
      const d = new Date(nextIso)
      if (!Number.isNaN(d.getTime())) {
        return `You can use Team AI analysis at most once every 12 hours. Next available: ${d.toLocaleString()}.`
      }
    } catch {
      /* ignore */
    }
  }
  return 'You can use Team AI analysis at most once every 12 hours.'
}

function formatTeamAiVerificationMessage(lang: TeamAnalysisLanguage): string {
  return lang === 'vi'
    ? 'Phân tích AI chỉ bật sau khi tài khoản của bạn được xác minh.'
    : 'Team AI unlocks after your account is verified.'
}

function TeamProgressPill({ filled }: { filled: number }) {
  const complete = filled >= 6
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${
        complete
          ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-200'
          : 'border-amber-500/35 bg-amber-950/30 text-amber-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${complete ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
      {filled}/6 Pokémon
    </span>
  )
}

export function TeamBuilder() {
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const isAdminUser = Boolean(user?.is_admin)
  const canUseTeamAi = isAdminUser || Boolean(user?.minecraft_verified_at)
  const [slots, setSlots] = useState<TeamBuildSlot[]>(() => emptyTeamSlots())
  const [pasteImport, setPasteImport] = useState('')
  const [teamName, setTeamName] = useState('')
  const [savedTeamRowId, setSavedTeamRowId] = useState<number | null>(null)
  const [savedList, setSavedList] = useState<SavedTeamRow[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [pokepasteBusy, setPokepasteBusy] = useState(false)
  const [pokepasteUrl, setPokepasteUrl] = useState<string | null>(null)
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

  useEffect(() => {
    if (isAuthenticated && !canUseTeamAi) {
      setAiAnalysis(null)
      setAiError(null)
    }
  }, [isAuthenticated, canUseTeamAi])

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
      setSaveOk('Showdown paste copied to clipboard.')
    } catch {
      setSaveOk(null)
    }
    setTimeout(() => setSaveOk(null), 2500)
  }, [slots])

  const uploadToPokepaste = useCallback(
    async (paste: string, title: string) => {
      if (!paste.trim()) {
        setSaveError(null)
        setSaveOk('Add at least one Pokémon first.')
        setTimeout(() => setSaveOk(null), 2500)
        return
      }
      setPokepasteBusy(true)
      setPokepasteUrl(null)
      setSaveError(null)
      try {
        const author = user?.username?.trim() || 'AuroraCobble'
        const { url } = await createTeamPokepasteLink({
          paste,
          title: title.trim() || 'Team',
          author,
        })
        setPokepasteUrl(url)
        saveTeamPasteView({
          title: title.trim() || 'Team',
          paste,
          pokepastUrl: url,
        })
        try {
          await navigator.clipboard.writeText(url)
          setSaveOk('PokePaste link copied to clipboard.')
        } catch {
          setSaveOk('PokePaste link created — open the link below.')
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'PokePaste upload failed')
      } finally {
        setPokepasteBusy(false)
        setTimeout(() => setSaveOk(null), 5000)
      }
    },
    [user?.username],
  )

  const createPokepasteLinkForCurrentTeam = useCallback(() => {
    void uploadToPokepaste(teamSlotsToPaste(slots), teamName)
  }, [slots, teamName, uploadToPokepaste])

  const runTeamAnalyseByAi = useCallback(async () => {
    if (!isAuthenticated) {
      setAiError(
        aiLang === 'vi'
          ? 'Đăng nhập để dùng phân tích AI (tài khoản thường: 1 lần / 12 giờ).'
          : 'Log in to use AI team analysis (standard accounts: once per 12 hours).',
      )
      setAiAnalysis(null)
      setShowAuth(true)
      return
    }
    if (!isAdminUser && !user?.minecraft_verified_at) {
      setAiError(formatTeamAiVerificationMessage(aiLang))
      setAiAnalysis(null)
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
      } else if (e instanceof Error && e.message === 'TEAM_AI_VERIFICATION_REQUIRED') {
        setAiError(formatTeamAiVerificationMessage(aiLang))
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
  }, [slots, aiLang, isAuthenticated, isAdminUser, user?.minecraft_verified_at])

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
      const aiPayload =
        canUseTeamAi && aiAnalysis?.trim() ? aiAnalysis : null
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
    const allowAi = isAdminUser || Boolean(user?.minecraft_verified_at)
    setAiAnalysis(
      allowAi && row.ai_analysis?.trim() ? row.ai_analysis : null,
    )
  }

  const copySavedTeamPokepaste = useCallback(async (row: SavedTeamRow) => {
    const text = teamSlotsToPaste(slotsFromSavedJson(row.team_json))
    try {
      await navigator.clipboard.writeText(text)
      setSaveOk(`"${row.name}" paste copied.`)
    } catch {
      setSaveOk('Could not copy to clipboard.')
    }
    setTimeout(() => setSaveOk(null), 2500)
  }, [])

  const createPokepasteLinkForSavedTeam = useCallback(
    (row: SavedTeamRow) => {
      void uploadToPokepaste(teamSlotsToPaste(slotsFromSavedJson(row.team_json)), row.name)
    },
    [uploadToPokepaste],
  )

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
    setPokepasteUrl(null)
    setSaveError(null)
    setSaveOk(null)
    setAiAnalysis(null)
    setAiError(null)
    closeForm()
  }

  return (
    <PageShell max="5xl" className="!pb-8">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}

      <PageHeader
        accent="emerald"
        eyebrow="Competitive teams"
        title="Team Builder"
        description="Build Showdown-ready teams with sprites and item icons. Export paste, create PokePaste links, or open the sprite viewer. Sign in to save teams to your account."
        aside={<TeamProgressPill filled={slots.filter((s) => s.species.trim()).length} />}
      />

      <PageSection title="Quick actions" padded className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={newTeam} className="pixel-btn text-sm h-10 px-4">
            New team
          </button>
          <button type="button" onClick={() => void exportPaste()} className="pixel-btn text-sm h-10 px-4">
            Copy paste text
          </button>
          <button
            type="button"
            onClick={createPokepasteLinkForCurrentTeam}
            disabled={pokepasteBusy}
            className="pixel-btn-primary text-sm h-10 px-4 disabled:opacity-60"
          >
            {pokepasteBusy ? 'Uploading…' : 'Create PokePaste link'}
          </button>
        </div>
        {canUseTeamAi ? (
          <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border/40">
            <div className="flex flex-col gap-1 min-w-[200px] sm:min-w-[240px] flex-1">
              <label htmlFor="tb-ai-lang" className="text-[11px] uppercase tracking-wide text-muted m-0 px-0.5">
                Analysis language
              </label>
              <CustomSelect
                id="tb-ai-lang"
                value={aiLang}
                onChange={(v) => persistAiLang(v === 'vi' ? 'vi' : 'en')}
                disabled={aiLoading}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'vi', label: 'Tiếng Việt' },
                ]}
                className="w-full"
                buttonClassName="pixel-field text-sm h-10 px-3 w-full disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={() => void runTeamAnalyseByAi()}
              disabled={aiLoading}
              className="pixel-btn-primary text-sm h-10 px-5 disabled:opacity-60 shrink-0"
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
        ) : null}
      </PageSection>

      {(saveOk || saveError || pokepasteUrl) && (
        <PageSection className="border-violet-500/30 bg-gradient-to-br from-violet-950/35 to-[#0f0a1a]/80 space-y-3 text-sm">
          {saveOk ? (
            <p className="text-emerald-300 m-0 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2">
              {saveOk}
            </p>
          ) : null}
          {saveError ? (
            <p className="text-red-400 m-0 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2">
              {saveError}
            </p>
          ) : null}
          {pokepasteUrl ? (
            <>
              <p className="m-0 flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  className="pixel-btn-primary text-sm py-2 px-4"
                  onClick={() => {
                    window.location.hash = 'team/paste'
                    window.dispatchEvent(new HashChangeEvent('hashchange'))
                  }}
                >
                  View team with sprites
                </button>
                <a
                  href={pokepasteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline break-all"
                >
                  {pokepasteUrl}
                </a>
              </p>
              {slots.some((s) => s.species.trim()) ? (
                <div className="rounded-lg border border-border/50 bg-[#0f0a1a]/50 p-3 space-y-2">
                  <p className="text-xs text-muted m-0">Team in this link</p>
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                    {slots
                      .filter((s) => s.species.trim())
                      .map((slot, i) => (
                        <div
                          key={`${slot.speciesSlug}-${i}`}
                          className="flex flex-col items-center gap-1 min-w-[4.5rem] max-w-[5.5rem] rounded-lg border border-border/40 bg-[#0f0a1a]/60 px-2 py-2"
                        >
                          <PokemonSprite
                            speciesSlug={slot.speciesSlug || speciesDisplayToSlug(slot.species)}
                            speciesDisplay={slot.species}
                            className="w-14 h-14"
                          />
                          <span className="text-[10px] text-center text-[#f5efe6] leading-tight line-clamp-2">
                            {slot.species.trim()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </PageSection>
      )}

      {!authLoading && !(isAuthenticated && isAdminUser && canUseTeamAi) ? (
        <PageNotice className="max-w-3xl">
          {!isAuthenticated ? (
            aiLang === 'vi' ? (
              <>
                Phân tích AI cần <span className="text-[#f5efe6]/90">đăng nhập</span>,{' '}
                <span className="text-[#f5efe6]/90">xác minh tài khoản</span>, tối đa{' '}
                <span className="text-[#f5efe6]/90">1 lần / 12 giờ</span>.
              </>
            ) : (
              <>
                AI analysis requires <span className="text-[#f5efe6]/90">logging in</span> and a{' '}
                <span className="text-[#f5efe6]/90">verified account</span> (up to{' '}
                <span className="text-[#f5efe6]/90">once per 12 hours</span>).
              </>
            )
          ) : canUseTeamAi ? (
            aiLang === 'vi' ? (
              <>
                Đã xác minh in-game. Tài khoản thường: tối đa{' '}
                <span className="text-[#f5efe6]/90">1 lần phân tích AI mỗi 12 giờ</span>.
              </>
            ) : (
              <>
                In-game verified. Standard account:{' '}
                <span className="text-[#f5efe6]/90">one AI analysis every 12 hours</span>.
              </>
            )
          ) : aiLang === 'vi' ? (
            <>{formatTeamAiVerificationMessage('vi')}</>
          ) : (
            <>{formatTeamAiVerificationMessage('en')}</>
          )}
        </PageNotice>
      ) : null}

      {isAuthenticated && !authLoading && !canUseTeamAi ? (
        <PageNotice variant="warn" className="max-w-2xl text-xs">
          {formatTeamAiVerificationMessage(aiLang)}
        </PageNotice>
      ) : null}

      {isAuthenticated && (
        <PageSection
          title="Saved teams"
          description={
            savedList.length > 0 ? `${savedList.length} saved on your account` : undefined
          }
        >
          {savedLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 animate-pulse">
              <div className="h-28 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
              <div className="h-28 rounded-xl bg-[#0f0a1a]/60 border border-border/40" />
            </div>
          ) : savedList.length === 0 ? (
            <PageEmptyState>No saved teams yet. Build a team and save it below.</PageEmptyState>
          ) : (
            <ul className="list-none m-0 p-0 grid gap-3 sm:grid-cols-2">
              {savedList.map((t) => (
                <li
                  key={t.id}
                  className={`rounded-xl border p-4 space-y-3 transition-colors ${
                    savedTeamRowId === t.id
                      ? 'border-emerald-500/45 bg-emerald-950/20 ring-1 ring-emerald-500/20'
                      : 'border-border/55 bg-[#0f0a1a]/50 hover:border-violet-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[#f5efe6] font-semibold m-0 truncate">{t.name}</p>
                      <p className="text-[11px] text-muted m-0 mt-1">
                        {new Date(t.updated_at).toLocaleString()}
                      </p>
                    </div>
                    {savedTeamRowId === t.id ? (
                      <span className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                        Loaded
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="pixel-btn-primary text-xs py-1.5 px-2.5"
                      onClick={() => loadTeam(t)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="pixel-btn text-xs py-1.5 px-2.5"
                      onClick={() => void copySavedTeamPokepaste(t)}
                    >
                      Copy paste
                    </button>
                    <button
                      type="button"
                      className="pixel-btn text-xs py-1.5 px-2.5 disabled:opacity-60"
                      disabled={pokepasteBusy}
                      onClick={() => createPokepasteLinkForSavedTeam(t)}
                    >
                      PokePaste
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-400/90 hover:text-red-300 py-1.5 px-2 ml-auto"
                      onClick={() => void handleDelete(t.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      )}

      {(aiError || (canUseTeamAi && aiAnalysis)) && (
        <PageSection
          title={aiLang === 'vi' ? 'Phân tích đội (AI)' : 'AI team analysis'}
          description={
            aiLang === 'vi'
              ? 'Nội dung do AI tạo, có thể sai. Đội hình chỉ được gửi lên server cho một lần phân tích này.'
              : 'Suggestions are AI-generated and may be wrong. Your team is sent to the server for this request only.'
          }
          className="border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-[#0a1018]/90 to-[#0f0a1a]/90"
        >
          {aiError ? (
            <p className="text-sm text-red-400 m-0 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2">
              {aiError}
            </p>
          ) : null}
          {canUseTeamAi && aiAnalysis ? (
            <div className="rounded-xl bg-[#0f0a1a]/60 border border-border/50 p-4 text-sm max-h-[min(28rem,55vh)] overflow-y-auto font-sans leading-relaxed [&>*:first-child]:mt-0 shadow-inner">
              <ReactMarkdown components={aiAnalysisMarkdownComponents}>{aiAnalysis}</ReactMarkdown>
            </div>
          ) : null}
        </PageSection>
      )}

      <PageSection
        title="Team roster"
        description="Six slots — tap + to add. Click a Pokémon to edit moves, ability, or item."
      >
        <div className="flex justify-end -mt-2">
          <TeamProgressPill filled={slots.filter((s) => s.species.trim()).length} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {slots.map((slot, i) => {
            const filled = Boolean(slot.species.trim())
            const active = formSlotIndex === i
            return (
              <div
                key={i}
                className={`relative min-h-[12rem] flex flex-col rounded-xl border p-3 transition-all duration-150 ${
                  active
                    ? 'border-accent/70 bg-accent/5 shadow-[0_0_24px_rgba(251,191,36,0.12)] ring-1 ring-accent/30'
                    : filled
                      ? 'border-emerald-500/25 bg-gradient-to-b from-emerald-950/20 to-[#0f0a1a]/60 hover:border-emerald-500/40'
                      : 'border-border/50 bg-[#0f0a1a]/40 hover:border-border/80'
                }`}
              >
                <p
                  className={`text-[10px] uppercase tracking-wider font-semibold m-0 mb-2 text-center ${
                    filled ? 'text-emerald-300/80' : 'text-muted'
                  }`}
                >
                  Slot {i + 1}
                </p>
                {!filled ? (
                  <button
                    type="button"
                    onClick={() => openSlotForm(i)}
                    className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 hover:border-accent/50 hover:bg-accent/5 text-muted hover:text-[#f5efe6] transition-colors min-h-[9.5rem] group"
                  >
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-accent/40 text-2xl font-light text-accent/80 group-hover:border-accent group-hover:text-accent transition-colors"
                      aria-hidden
                    >
                      +
                    </span>
                    <span className="text-xs font-medium">Add Pokémon</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openSlotForm(i)}
                      className="flex-1 flex flex-col items-center text-center gap-1.5 rounded-lg hover:bg-white/[0.03] p-1 -m-1 transition-colors w-full"
                    >
                      <div className="rounded-xl bg-[#0f0a1a]/50 p-1.5 border border-border/30">
                        <PokemonSprite
                          speciesSlug={slot.speciesSlug || speciesDisplayToSlug(slot.species)}
                          speciesDisplay={slot.species}
                          className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem]"
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#f5efe6] leading-tight line-clamp-2 px-0.5">
                        {slot.species.trim()}
                      </span>
                      <div className="flex items-center justify-center gap-1.5 max-w-full px-1 min-h-[1.5rem]">
                        {slot.item.trim() ? (
                          <>
                            <TeamBuilderItemIcon itemName={slot.item} className="w-5 h-5 shrink-0" />
                            <span className="text-[11px] text-amber-200/90 truncate">{slot.item}</span>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted">No item</span>
                        )}
                      </div>
                    </button>
                    <div className="flex justify-center gap-3 mt-2 pt-2 border-t border-border/30">
                      <button
                        type="button"
                        className="text-[11px] font-medium text-accent hover:underline"
                        onClick={() => openSlotForm(i)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-red-400/90 hover:underline"
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
      </PageSection>

      {formSlotIndex !== null && draft ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-[#f5efe6] m-0">Add / edit Pokémon</h3>
          {formError ? (
            <p className="text-sm text-red-400 m-0 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2">
              {formError}
            </p>
          ) : null}
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
            <button type="button" onClick={applyDraftToSlot} className="pixel-btn-primary text-sm py-2 px-5">
              Save to slot
            </button>
            <button type="button" onClick={closeForm} className="pixel-btn text-sm py-2 px-5">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <details className="rounded-xl border border-border/60 bg-[#0f0a1a]/50 group">
        <summary className="cursor-pointer list-none px-4 py-3 sm:px-5 sm:py-4 text-sm font-medium text-[#f5efe6] hover:bg-surface-hover/20 rounded-xl transition-colors [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="text-muted group-open:rotate-90 transition-transform inline-block">▸</span>
            Import Showdown paste
          </span>
        </summary>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-3 border-t border-border/40 pt-3">
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
      </details>

      <PageSection
        title={savedTeamRowId != null ? 'Update saved team' : 'Save to account'}
        className="border-emerald-500/25 bg-gradient-to-br from-emerald-950/25 to-[#0f0a1a]/90"
      >
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <label htmlFor="team-save-name" className="text-[11px] uppercase tracking-wide text-muted block mb-1.5">
              Team name
            </label>
            <input
              id="team-save-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="My OU squad"
              className="w-full pixel-field px-3 py-2.5 text-sm"
              maxLength={120}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="pixel-btn-primary py-2.5 px-5 shrink-0 w-full sm:w-auto"
          >
            {savedTeamRowId != null ? 'Save changes' : 'Save team'}
          </button>
        </div>
        {isAuthenticated && canUseTeamAi ? (
          <p className="text-xs text-muted m-0">
            {aiLang === 'vi'
              ? 'Bản phân tích AI mới nhất được lưu khi bạn bấm Lưu (và hiện lại khi tải đội này).'
              : 'The latest AI analysis text is stored when you save (and shown again when you load this team).'}
          </p>
        ) : null}
        {!isAuthenticated && (
          <PageNotice>Log in to store teams on your account. You can still build and copy paste without logging in.</PageNotice>
        )}
        {saveError && (
          <p className="text-sm text-red-400 m-0 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2">
            {saveError}
          </p>
        )}
        {saveOk && (
          <p className="text-sm text-emerald-400/90 m-0 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2">
            {saveOk}
          </p>
        )}
      </PageSection>
    </PageShell>
  )
}
