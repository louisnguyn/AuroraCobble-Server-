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
import { analyzeTeamWithAI, createTeamPokepasteLink, type TeamAnalysisLanguage } from '../api'
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
import { CustomSelect } from './CustomSelect'

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
    <div className="pixel-panel-soft p-4 sm:p-5 space-y-3 border-2 border-accent/35 ring-1 ring-amber-900/30">
      <p className="text-sm font-semibold text-[#f5efe6] m-0">Edit slot {slotNumber}</p>
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
            options={speciesOptions.map((p) => formatSpeciesLabel(p.name))}
            placeholder="e.g. Great Tusk"
          />
        </div>
        <div className="sm:col-span-2">
          <AutoCompleteField
            label="Item"
            value={draft.item}
            onChange={(item) => patch({ item })}
            options={itemOptions.map((it) => formatSpeciesLabel(it.name))}
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
            options={abilityOptions.map((a) => formatSpeciesLabel(a.name))}
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
              options={moveOptions.map((m) => formatSpeciesLabel(m.name))}
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
    ? 'Phân tích AI chỉ bật sau khi quản trị viên xác minh tài khoản của bạn trên trang Admin.'
    : 'Team AI unlocks after staff mark your account as verified in the admin panel.'
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
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold m-0 text-[#f5efe6]">Team Builder</h1>
        <p className="text-sm text-muted m-0 mt-2 max-w-2xl">
          Tap <span className="text-[#f5efe6]">+</span> on an empty slot to add a Pokémon. Filled slots
          show sprite and item. Export as Showdown paste text or upload a{' '}
          <span className="text-[#f5efe6]">PokePaste</span> link (pokepast.es). Log in to save teams.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={newTeam} className="pixel-btn text-sm h-11 px-4">
          New team
        </button>
        <button type="button" onClick={() => void exportPaste()} className="pixel-btn text-sm h-11 px-4">
          Copy paste text
        </button>
        <button
          type="button"
          onClick={createPokepasteLinkForCurrentTeam}
          disabled={pokepasteBusy}
          className="pixel-btn-primary text-sm h-11 px-4 disabled:opacity-60"
        >
          {pokepasteBusy ? 'Uploading…' : 'Create PokePaste link'}
        </button>
        {canUseTeamAi ? (
          <>
            <div className="flex flex-col gap-1 min-w-[240px] sm:min-w-[300px]">
              <label htmlFor="tb-ai-lang" className="text-xs text-muted whitespace-nowrap m-0 px-1">
                AI language / Ngôn ngữ
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
                buttonClassName="pixel-field text-sm h-11 px-3 w-full disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={() => void runTeamAnalyseByAi()}
              disabled={aiLoading}
              className="pixel-btn-primary text-sm h-11 px-4 disabled:opacity-60"
            >
              {aiLoading
                ? aiLang === 'vi'
                  ? 'Đang phân tích…'
                  : 'Analysing…'
                : aiLang === 'vi'
                  ? 'Phân tích đội (AI)'
                  : 'Team analyse by AI'}
            </button>
          </>
        ) : null}
      </div>

      {(saveOk || saveError || pokepasteUrl) && (
        <div className="pixel-panel-soft p-3 space-y-2 text-sm max-w-2xl">
          {saveOk ? <p className="text-emerald-300 m-0">{saveOk}</p> : null}
          {saveError ? <p className="text-red-400 m-0">{saveError}</p> : null}
          {pokepasteUrl ? (
            <p className="m-0 text-muted">
              <a
                href={pokepasteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline break-all"
              >
                {pokepasteUrl}
              </a>
              {' · '}
              <a
                href="https://play.pokemonshowdown.com/teambuilder"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Open Showdown teambuilder
              </a>
            </p>
          ) : null}
        </div>
      )}

      {!authLoading ? (
        <p className="text-[11px] text-muted m-0 max-w-2xl">
          {!isAuthenticated ? (
            aiLang === 'vi' ? (
              <>
                Phân tích AI cần <span className="text-[#f5efe6]/90">đăng nhập</span>,{' '}
                <span className="text-[#f5efe6]/90">xác minh in-game</span> (staff), rồi tối đa{' '}
                <span className="text-[#f5efe6]/90">1 lần / 12 giờ</span>.
              </>
            ) : (
              <>
                AI analysis requires <span className="text-[#f5efe6]/90">logging in</span>, staff{' '}
                <span className="text-[#f5efe6]/90">in-game verification</span>, then standard accounts:{' '}
                <span className="text-[#f5efe6]/90">once per 12 hours</span>.
              </>
            )
          ) : canUseTeamAi ? (
            isAdminUser ? (
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
        </p>
      ) : null}

      {isAuthenticated && !authLoading && !canUseTeamAi ? (
        <div className="pixel-panel-soft p-3 text-xs text-amber-100/95 border border-amber-500/35 rounded-lg m-0 max-w-2xl leading-relaxed">
          {formatTeamAiVerificationMessage(aiLang)}
        </div>
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
                      className="pixel-btn text-xs py-1.5 px-2"
                      onClick={() => void copySavedTeamPokepaste(t)}
                    >
                      Copy paste
                    </button>
                    <button
                      type="button"
                      className="pixel-btn-primary text-xs py-1.5 px-2 disabled:opacity-60"
                      disabled={pokepasteBusy}
                      onClick={() => createPokepasteLinkForSavedTeam(t)}
                    >
                      PokePaste link
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

      {(aiError || (canUseTeamAi && aiAnalysis)) && (
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
          {canUseTeamAi && aiAnalysis ? (
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
        {isAuthenticated && canUseTeamAi ? (
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
