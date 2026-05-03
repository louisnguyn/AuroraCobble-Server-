import { useEffect, useMemo, useState } from 'react'
import {
  fetchAdminUsers,
  fetchAdminUserCurrency,
  fetchAdminUserHistory,
  grantCurrency,
  setPullFulfilled,
  deleteAdminPull,
  deleteAllAdminUserGachaHistory,
  patchAdminUser,
  adminResetUserPassword,
  deleteAdminUser,
  bulkGrantCobbledollars,
  bulkGrantInventory,
  fetchGrantableInventoryItems,
  verifyUserIngame,
  revokeUserIngameVerification,
  fetchAdminMinecraftRoles,
  grantAdminUserMinecraftRole,
  type AdminUser,
  type UserCurrencyRow,
  type AdminHistoryEntry,
} from '../authApi'
import { RoleBadge } from './RoleBadge.tsx'

type UsersTab = 'account' | 'rewards' | 'bulkCobble' | 'bulkItems'

export function UsersAdmin({ currentAdminId }: { currentAdminId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [currencies, setCurrencies] = useState<UserCurrencyRow[]>([])
  const [history, setHistory] = useState<AdminHistoryEntry[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [grantType, setGrantType] = useState('tickets')
  const [grantAmount, setGrantAmount] = useState('')
  const [granting, setGranting] = useState(false)
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<AdminHistoryEntry | null>(null)
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false)
  const [deleteAllHistoryOpen, setDeleteAllHistoryOpen] = useState(false)
  const [deleteAllHistoryBusy, setDeleteAllHistoryBusy] = useState(false)

  const [tab, setTab] = useState<UsersTab>('account')
  const [editEmail, setEditEmail] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [bulkIds, setBulkIds] = useState<number[]>([])
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkAllUsers, setBulkAllUsers] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [grantableItems, setGrantableItems] = useState<{ key: string; label: string }[]>([])
  const [bulkItemKey, setBulkItemKey] = useState('')
  const [bulkItemQty, setBulkItemQty] = useState('1')
  const [bulkItemConfirmOpen, setBulkItemConfirmOpen] = useState(false)
  const [bulkItemBusy, setBulkItemBusy] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [ingameVerifyBusy, setIngameVerifyBusy] = useState(false)
  const [minecraftRoleKeys, setMinecraftRoleKeys] = useState<string[]>([])
  const [grantRolePick, setGrantRolePick] = useState('')
  const [grantRoleBusy, setGrantRoleBusy] = useState(false)

  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const idStr = String(u.id)
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        idStr.includes(q)
      )
    })
  }, [users, userSearchQuery])

  const roleSelectOptions = useMemo(() => {
    const base = minecraftRoleKeys.length > 0 ? minecraftRoleKeys : ['member']
    const cur = (selectedUser?.minecraft_role || '').trim().toLowerCase()
    if (cur && !base.includes(cur)) return [cur, ...base]
    return base
  }, [minecraftRoleKeys, selectedUser?.minecraft_role])

  useEffect(() => {
    fetchAdminUsers()
      .then(({ users: u }) => setUsers(u))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAdminMinecraftRoles()
      .then(({ keys }) => setMinecraftRoleKeys(keys))
      .catch(() => setMinecraftRoleKeys([]))
  }, [])

  useEffect(() => {
    fetchGrantableInventoryItems()
      .then(({ items }) => {
        setGrantableItems(items)
        setBulkItemKey((k) => (k && items.some((i) => i.key === k) ? k : items[0]?.key ?? ''))
      })
      .catch(() => setGrantableItems([]))
  }, [])

  useEffect(() => {
    if (!selectedUser) {
      setCurrencies([])
      setHistory([])
      setHistoryError(null)
      return
    }
    setError(null)
    setHistoryError(null)
    fetchAdminUserCurrency(selectedUser.id)
      .then(({ currencies: c }) => setCurrencies(c))
      .catch(() => setCurrencies([]))
    fetchAdminUserHistory(selectedUser.id)
      .then(({ history: h }) => setHistory(h))
      .catch((e) => {
        setHistory([])
        setHistoryError(e instanceof Error ? e.message : 'Failed to load history')
      })
  }, [selectedUser])

  useEffect(() => {
    if (!selectedUser) {
      setEditEmail('')
      setEditUsername('')
      setEditIsAdmin(false)
      setGrantRolePick('')
      return
    }
    setEditEmail(selectedUser.email)
    setEditUsername(selectedUser.username)
    setEditIsAdmin(selectedUser.is_admin)
    setNewPassword('')
    setConfirmPassword('')
    setGrantRolePick((selectedUser.minecraft_role || 'member').trim().toLowerCase())
  }, [selectedUser])

  const mergeUserIntoList = (u: AdminUser) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)))
    setSelectedUser((s) => (s?.id === u.id ? u : s))
  }

  const toggleBulkId = (id: number) => {
    setBulkIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectBulkFiltered = () => {
    setBulkIds((prev) => [...new Set([...prev, ...filteredUsers.map((u) => u.id)])])
  }

  const clearBulkSelection = () => setBulkIds([])

  const bulkCobbleTargetIds = useMemo(
    () => (bulkAllUsers ? [...new Set(users.map((u) => u.id))] : [...new Set(bulkIds)]),
    [bulkAllUsers, users, bulkIds]
  )

  const openBulkConfirm = () => {
    setError(null)
    setSuccessMessage(null)
    const n = Number(bulkAmount)
    const targetCount = bulkCobbleTargetIds.length
    if (targetCount === 0) {
      setError(
        bulkAllUsers
          ? 'No users available to receive this grant.'
          : 'Select at least one user in the list (use the checkboxes).'
      )
      return
    }
    if (targetCount > 500) {
      setError('At most 500 users per request. Clear some selections or run multiple batches.')
      return
    }
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      setError('Enter a positive whole number for Cobble$.')
      return
    }
    setBulkConfirmOpen(true)
  }

  const confirmBulkGrant = async () => {
    const amount = Number(bulkAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setBulkBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const res = await bulkGrantCobbledollars({
        user_ids: bulkCobbleTargetIds,
        amount,
        ...(bulkNote.trim() ? { note: bulkNote.trim() } : {}),
      })
      setBulkConfirmOpen(false)
      const failMsg =
        res.failures.length > 0
          ? ` ${res.failures.length} failed (${res.failures.slice(0, 3).map((f) => `#${f.user_id}`).join(', ')}${res.failures.length > 3 ? '…' : ''}).`
          : ''
      setSuccessMessage(
        `Added ${res.amount_per_user.toLocaleString()} Cobble$ to ${res.granted} of ${res.requested} accounts.${failMsg}`
      )
      if (selectedUser && bulkCobbleTargetIds.includes(selectedUser.id)) {
        const { currencies: c } = await fetchAdminUserCurrency(selectedUser.id)
        setCurrencies(c)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk grant failed')
      setBulkConfirmOpen(false)
    } finally {
      setBulkBusy(false)
    }
  }

  const openBulkItemConfirm = () => {
    setError(null)
    setSuccessMessage(null)
    const qty = Number(bulkItemQty)
    if (bulkIds.length === 0) {
      setError('Select at least one user in the list (use the checkboxes).')
      return
    }
    if (bulkIds.length > 500) {
      setError('At most 500 users per request. Clear some selections or run multiple batches.')
      return
    }
    if (!bulkItemKey || !grantableItems.some((i) => i.key === bulkItemKey)) {
      setError('Choose an item from the list.')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setError('Enter a positive whole number for quantity per user.')
      return
    }
    setBulkItemConfirmOpen(true)
  }

  const confirmBulkItemGrant = async () => {
    const qty = Number(bulkItemQty)
    if (!Number.isFinite(qty) || qty <= 0) return
    setBulkItemBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const res = await bulkGrantInventory({
        user_ids: [...new Set(bulkIds)],
        item_key: bulkItemKey,
        amount: qty,
        ...(bulkNote.trim() ? { note: bulkNote.trim() } : {}),
      })
      setBulkItemConfirmOpen(false)
      const failMsg =
        res.failures.length > 0
          ? ` ${res.failures.length} failed (${res.failures.slice(0, 3).map((f) => `#${f.user_id}`).join(', ')}${res.failures.length > 3 ? '…' : ''}).`
          : ''
      setSuccessMessage(
        `Granted ${res.amount_per_user}× ${res.label} to ${res.granted} of ${res.requested} accounts.${failMsg}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk item grant failed')
      setBulkItemConfirmOpen(false)
    } finally {
      setBulkItemBusy(false)
    }
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || savingAccount) return
    setSavingAccount(true)
    setError(null)
    try {
      const { user } = await patchAdminUser(selectedUser.id, {
        email: editEmail.trim().toLowerCase(),
        username: editUsername.trim(),
        is_admin: editIsAdmin,
      })
      mergeUserIntoList(user)
      setEditEmail(user.email)
      setEditUsername(user.username)
      setEditIsAdmin(user.is_admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account')
    } finally {
      setSavingAccount(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || resettingPassword) return
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setResettingPassword(true)
    setError(null)
    try {
      await adminResetUserPassword(selectedUser.id, newPassword)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed')
    } finally {
      setResettingPassword(false)
    }
  }

  const closeDeleteAccount = () => {
    if (!deleteAccountBusy) setDeleteAccountOpen(false)
  }

  const confirmDeleteAccount = async () => {
    if (!selectedUser) return
    setDeleteAccountBusy(true)
    setError(null)
    try {
      await deleteAdminUser(selectedUser.id)
      const id = selectedUser.id
      setUsers((prev) => prev.filter((u) => u.id !== id))
      setSelectedUser(null)
      setDeleteAccountOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleteAccountBusy(false)
    }
  }

  const handleVerifyIngame = async () => {
    if (!selectedUser || ingameVerifyBusy) return
    setIngameVerifyBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const { user } = await verifyUserIngame(selectedUser.id)
      mergeUserIntoList(user)
      setSuccessMessage(`Marked ${user.username} as verified. Team AI is now allowed for this account.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'In-game verification failed')
    } finally {
      setIngameVerifyBusy(false)
    }
  }

  const handleRevokeIngame = async () => {
    if (!selectedUser?.minecraft_verified_at || ingameVerifyBusy) return
    setIngameVerifyBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const { user } = await revokeUserIngameVerification(selectedUser.id)
      mergeUserIntoList(user)
      setSuccessMessage(`Cleared verification for ${user.username}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke verification')
    } finally {
      setIngameVerifyBusy(false)
    }
  }

  const handleGrantMinecraftRole = async () => {
    if (!selectedUser || grantRoleBusy) return
    setGrantRoleBusy(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const { user } = await grantAdminUserMinecraftRole(selectedUser.id, grantRolePick)
      mergeUserIntoList(user)
      const applied = (user.minecraft_role ?? grantRolePick).trim().toLowerCase()
      setGrantRolePick(applied)
      setSuccessMessage(`In-game and website rank set to ${applied} for ${user.username}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set Minecraft rank')
    } finally {
      setGrantRoleBusy(false)
    }
  }

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || granting) return
    const amount = Number(grantAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount')
      return
    }
    setGranting(true)
    setError(null)
    try {
      await grantCurrency(selectedUser.id, grantType.trim(), amount)
      setGrantAmount('')
      const { currencies: c } = await fetchAdminUserCurrency(selectedUser.id)
      setCurrencies(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed')
    } finally {
      setGranting(false)
    }
  }

  const handleToggleFulfilled = async (entry: AdminHistoryEntry) => {
    const next = !entry.fulfilledAt
    try {
      const res = await setPullFulfilled(entry.id, next)
      setHistory((prev) =>
        prev.map((h) => (h.id === entry.id ? { ...h, fulfilledAt: res.fulfilled_at } : h))
      )
    } catch {
      // ignore
    }
  }

  const openDeleteConfirm = (entry: AdminHistoryEntry) => {
    setDeleteConfirmEntry(entry)
  }

  const closeDeleteConfirm = () => {
    if (!deleteConfirmBusy) setDeleteConfirmEntry(null)
  }

  const confirmDeletePull = async () => {
    const entry = deleteConfirmEntry
    if (!entry) return
    setDeleteConfirmBusy(true)
    try {
      await deleteAdminPull(entry.id)
      setHistory((prev) => prev.filter((h) => h.id !== entry.id))
      setDeleteConfirmEntry(null)
    } catch {
      // ignore
    } finally {
      setDeleteConfirmBusy(false)
    }
  }

  const closeDeleteAllHistory = () => {
    if (!deleteAllHistoryBusy) setDeleteAllHistoryOpen(false)
  }

  const confirmDeleteAllHistory = async () => {
    if (!selectedUser) return
    setDeleteAllHistoryBusy(true)
    setError(null)
    try {
      const { deleted } = await deleteAllAdminUserGachaHistory(selectedUser.id)
      setHistory([])
      setDeleteAllHistoryOpen(false)
      setSuccessMessage(
        deleted === 0
          ? 'No gacha history rows were found for this user.'
          : `Removed ${deleted} gacha ${deleted === 1 ? 'pull' : 'pulls'} from this account.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete history')
    } finally {
      setDeleteAllHistoryBusy(false)
    }
  }

  const formatDate = (s: string) =>
    new Date(s).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (loading) {
    return (
      <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
        Loading users…
      </div>
    )
  }

  const isSelf = selectedUser?.id === currentAdminId
  const lastAdminWarning =
    selectedUser?.is_admin && users.filter((u) => u.is_admin).length === 1

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#f5efe6]">Website users</h1>
      <p className="text-sm text-muted m-0 -mt-2">
        Manage sign-in details, roles, and tickets or gacha rewards per account.
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 rounded-lg bg-surface border border-border overflow-hidden flex flex-col max-h-[min(70vh,32rem)] lg:max-h-[min(80vh,40rem)]">
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider m-0">All users</h2>
            <label htmlFor="user-search" className="sr-only">
              Search users by name, email, or ID
            </label>
            <input
              id="user-search"
              type="search"
              placeholder="Search name, email, ID…"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md bg-[#0f0d0b] border border-border text-sm text-[#f5efe6] placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/40"
              autoComplete="off"
            />
            {(tab === 'bulkCobble' || tab === 'bulkItems') && filteredUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectBulkFiltered}
                  disabled={tab === 'bulkCobble' && bulkAllUsers}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-accent/15 text-accent border border-accent/35 hover:bg-accent/25"
                >
                  Select visible ({filteredUsers.length})
                </button>
                <button
                  type="button"
                  onClick={clearBulkSelection}
                  disabled={bulkIds.length === 0}
                  className="px-2 py-1 rounded-md text-xs font-medium border border-border text-muted hover:text-[#f5efe6] hover:bg-surface-hover disabled:opacity-40"
                >
                  Clear selection
                </button>
              </div>
            )}
            <p className="text-[11px] text-muted m-0">
              {tab === 'bulkCobble' || tab === 'bulkItems' ? (
                <>
                  <span className="text-accent font-semibold">
                    {tab === 'bulkCobble' && bulkAllUsers ? users.length : bulkIds.length}
                  </span>{' '}
                  selected
                  {tab === 'bulkCobble' && bulkAllUsers ? ' (all users)' : ''} ·{' '}
                  {filteredUsers.length === users.length
                    ? `${users.length} user${users.length === 1 ? '' : 's'}`
                    : `${filteredUsers.length} of ${users.length} shown`}
                </>
              ) : filteredUsers.length === users.length ? (
                `${users.length} user${users.length === 1 ? '' : 's'}`
              ) : (
                `${filteredUsers.length} of ${users.length}`
              )}
            </p>
          </div>
          <ul className="overflow-y-auto min-h-0 flex-1">
            {filteredUsers.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">No users match your search.</li>
            ) : (
              filteredUsers.map((u) => (
                <li key={u.id} className="flex items-stretch border-b border-border/50">
                  {(tab === 'bulkCobble' || tab === 'bulkItems') && (
                    <div className="flex items-center pl-3 pr-0 shrink-0">
                      <input
                        type="checkbox"
                        checked={tab === 'bulkCobble' && bulkAllUsers ? true : bulkIds.includes(u.id)}
                        onChange={() => toggleBulkId(u.id)}
                        disabled={tab === 'bulkCobble' && bulkAllUsers}
                        className="rounded border-border"
                        aria-label={`Include ${u.username} in bulk grant`}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className={`flex-1 min-w-0 text-left py-3 pr-4 text-sm transition-colors border-l border-transparent ${
                      tab === 'bulkCobble' || tab === 'bulkItems' ? 'pl-2' : 'pl-4'
                    } ${
                      selectedUser?.id === u.id
                        ? 'bg-accent/20 text-accent font-medium'
                        : 'hover:bg-surface-hover text-[#f5efe6]'
                    }`}
                  >
                    <span className="font-medium inline-flex items-center gap-1.5 flex-wrap">
                      {u.username}
                      <RoleBadge roleKey={u.minecraft_role ?? 'member'} compact className="opacity-90" />
                    </span>
                    <span className="block text-xs text-muted truncate">{u.email}</span>
                    {u.is_admin && (
                      <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-accent/30 text-accent">
                        Admin
                      </span>
                    )}
                    {u.minecraft_verified_at != null && u.minecraft_verified_at !== '' && (
                      <span className="inline-block mt-1 ml-1 text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                        MC ✓
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-[#0f0d0b]/80 border border-border">
            <button
              type="button"
              onClick={() => {
                setTab('account')
                setSuccessMessage(null)
              }}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === 'account'
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-muted hover:text-[#f5efe6] border border-transparent'
              }`}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('rewards')
                setSuccessMessage(null)
              }}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === 'rewards'
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-muted hover:text-[#f5efe6] border border-transparent'
              }`}
            >
              Tickets &amp; gacha
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('bulkCobble')
                setSuccessMessage(null)
              }}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === 'bulkCobble'
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-muted hover:text-[#f5efe6] border border-transparent'
              }`}
            >
              Bulk Cobble$
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('bulkItems')
                setSuccessMessage(null)
              }}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === 'bulkItems'
                  ? 'bg-accent/25 text-accent border border-accent/40'
                  : 'text-muted hover:text-[#f5efe6] border border-transparent'
              }`}
            >
              Bulk items
            </button>
          </div>

          {tab === 'bulkCobble' && (
            <div className="rounded-lg bg-surface border border-border p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-1">Bulk Cobble$ (website wallet)</h2>
                <p className="text-xs text-muted m-0">
                  Choose users with the checkboxes in the list, enter an amount, and confirm. Each selected account
                  receives the same balance increase. Entries appear in the Cobble$ ledger like single-user grants.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={bulkAllUsers}
                  onChange={(e) => setBulkAllUsers(e.target.checked)}
                  className="rounded border-border"
                />
                Grant to all users ({users.length})
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="bulk-cobble-amt" className="block text-xs text-muted mb-1">
                    Amount per user (whole number)
                  </label>
                  <input
                    id="bulk-cobble-amt"
                    type="number"
                    min={1}
                    step={1}
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(e.target.value)}
                    className="w-36 px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="bulk-cobble-note" className="block text-xs text-muted mb-1">
                    Note (optional, for ledger)
                  </label>
                  <input
                    id="bulk-cobble-note"
                    type="text"
                    maxLength={500}
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="e.g. tournament prize, event compensation"
                    className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                  />
                </div>
                <button
                  type="button"
                  onClick={openBulkConfirm}
                  className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90"
                >
                  Review &amp; grant…
                </button>
              </div>
              <p className="text-xs text-muted m-0">
                Selected: <span className="text-[#f5efe6] font-medium">{bulkCobbleTargetIds.length}</span> users
                {bulkAllUsers ? ' (all users)' : ''} · max 500 per request.
              </p>
            </div>
          )}

          {tab === 'bulkItems' && (
            <div className="rounded-lg bg-surface border border-border p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-1">Bulk items (website inventory)</h2>
                <p className="text-xs text-muted m-0">
                  Same checkboxes as Cobble$: each selected account receives the same item stack in their website
                  inventory (claim in-game per your server setup).
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="bulk-item-key" className="block text-xs text-muted mb-1">
                    Item
                  </label>
                  <select
                    id="bulk-item-key"
                    value={bulkItemKey}
                    onChange={(e) => setBulkItemKey(e.target.value)}
                    className="min-w-[12rem] px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                  >
                    {grantableItems.length === 0 ? (
                      <option value="">Loading…</option>
                    ) : (
                      grantableItems.map((it) => (
                        <option key={it.key} value={it.key}>
                          {it.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="bulk-item-qty" className="block text-xs text-muted mb-1">
                    Qty per user
                  </label>
                  <input
                    id="bulk-item-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={bulkItemQty}
                    onChange={(e) => setBulkItemQty(e.target.value)}
                    className="w-28 px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="bulk-item-note" className="block text-xs text-muted mb-1">
                    Note (optional)
                  </label>
                  <input
                    id="bulk-item-note"
                    type="text"
                    maxLength={500}
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="e.g. event reward"
                    className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                  />
                </div>
                <button
                  type="button"
                  onClick={openBulkItemConfirm}
                  className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90"
                >
                  Review &amp; grant…
                </button>
              </div>
              <p className="text-xs text-muted m-0">
                Selected: <span className="text-[#f5efe6] font-medium">{bulkIds.length}</span> users · max 500 per
                request.
              </p>
            </div>
          )}

          {tab !== 'bulkCobble' && tab !== 'bulkItems' && !selectedUser && (
            <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
              Select a user to manage their account or tickets and gacha history.
            </div>
          )}

          {tab !== 'bulkCobble' && tab !== 'bulkItems' && selectedUser && (
            <>
              {tab === 'account' && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-surface border border-border p-4">
                    <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-3">
                      Profile · {selectedUser.username}
                    </h2>
                    <p className="text-xs text-muted m-0 mb-3">
                      User ID {selectedUser.id} · joined{' '}
                      {new Date(selectedUser.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    {lastAdminWarning && (
                      <p className="text-xs text-amber-200/90 m-0 mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                        This is the only admin account. You cannot remove admin or delete this user until another
                        admin exists.
                      </p>
                    )}
                    <form onSubmit={handleSaveAccount} className="space-y-3 max-w-md">
                      <div>
                        <label htmlFor="acct-email" className="block text-xs text-muted mb-1">
                          Email
                        </label>
                        <input
                          id="acct-email"
                          type="email"
                          autoComplete="off"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                        />
                      </div>
                      <div>
                        <label htmlFor="acct-username" className="block text-xs text-muted mb-1">
                          Username (often matches Minecraft IGN)
                        </label>
                        <input
                          id="acct-username"
                          type="text"
                          autoComplete="off"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-[#f5efe6]">
                        <input
                          type="checkbox"
                          checked={editIsAdmin}
                          onChange={(e) => setEditIsAdmin(e.target.checked)}
                          disabled={lastAdminWarning && selectedUser.is_admin}
                          className="rounded border-border"
                        />
                        Administrator (full admin site access)
                      </label>
                      <button
                        type="submit"
                        disabled={savingAccount}
                        className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                      >
                        {savingAccount ? 'Saving…' : 'Save profile'}
                      </button>
                    </form>
                  </div>

                  <div className="rounded-lg bg-surface border border-border p-4">
                    <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-2">Verification (Team AI)</h2>
                    <p className="text-xs text-muted m-0 mb-3">
                      Verified accounts may use Team Builder AI on the website (non-admins). Use the button below when
                      you have confirmed the player yourself — no server check is performed.
                    </p>
                    {selectedUser.minecraft_verified_at ? (
                      <p className="text-xs text-emerald-200/90 m-0 mb-3">
                        Verified{' '}
                        {new Date(selectedUser.minecraft_verified_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-muted m-0 mb-3">Not verified yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleVerifyIngame()}
                        disabled={ingameVerifyBusy}
                        className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                      >
                        {ingameVerifyBusy ? 'Saving…' : 'Mark as verified'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRevokeIngame()}
                        disabled={
                          ingameVerifyBusy || selectedUser.minecraft_verified_at == null || selectedUser.minecraft_verified_at === ''
                        }
                        className="px-3 py-1.5 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-40"
                      >
                        Clear verification
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface border border-border p-4">
                    <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-2">Minecraft rank</h2>
                    <p className="text-xs text-muted m-0 mb-3">
                      Sets this account&apos;s in-game rank on the server and updates the rank shown on the website.
                      Same options as the public rank shop — use it to assign a role right away, without a user request.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-xs text-muted">Current:</span>
                      <RoleBadge roleKey={selectedUser.minecraft_role ?? 'member'} />
                      <span className="text-xs text-[#f5efe6] font-mono">
                        {(selectedUser.minecraft_role ?? 'member').toLowerCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[200px] flex-1">
                        <label htmlFor="grant-mc-role" className="block text-xs text-muted mb-1">
                          Set rank to
                        </label>
                        <select
                          id="grant-mc-role"
                          value={grantRolePick}
                          onChange={(e) => setGrantRolePick(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                        >
                          {roleSelectOptions.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGrantMinecraftRole()}
                        disabled={
                          grantRoleBusy ||
                          !grantRolePick ||
                          grantRolePick === (selectedUser.minecraft_role ?? 'member').trim().toLowerCase()
                        }
                        className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                      >
                        {grantRoleBusy ? 'Applying…' : 'Apply rank'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-surface border border-border p-4">
                    <h2 className="text-sm font-semibold text-[#f5efe6] m-0 mb-2">Reset password</h2>
                    <p className="text-xs text-muted m-0 mb-3">
                      Sets a new password for this user. They can change it again after logging in.
                    </p>
                    <form onSubmit={handleResetPassword} className="flex flex-col gap-3 max-w-md">
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="New password (min 8 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                      />
                      <button
                        type="submit"
                        disabled={resettingPassword}
                        className="self-start px-3 py-1.5 rounded-lg bg-surface-hover border border-border text-sm text-[#f5efe6] hover:border-accent/50 disabled:opacity-50"
                      >
                        {resettingPassword ? 'Updating…' : 'Set password'}
                      </button>
                    </form>
                  </div>

                  <div className="rounded-lg bg-surface border border-error/25 p-4">
                    <h2 className="text-sm font-semibold text-error m-0 mb-2">Delete account</h2>
                    <p className="text-xs text-muted m-0 mb-3">
                      Permanently removes this website user and related data (teams, inventory, currency, etc.).
                      Cannot be undone.
                    </p>
                    <button
                      type="button"
                      disabled={isSelf || (lastAdminWarning && selectedUser.is_admin)}
                      onClick={() => setDeleteAccountOpen(true)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-error/15 border border-error/40 text-error hover:bg-error/25 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete this user…
                    </button>
                    {isSelf && (
                      <p className="text-xs text-muted m-0 mt-2">You cannot delete your own account from here.</p>
                    )}
                  </div>
                </div>
              )}

              {tab === 'rewards' && (
                <div className="space-y-4">
              <div className="rounded-lg bg-surface border border-border p-4">
                <h2 className="text-sm font-semibold text-[#f5efe6] mb-3">
                  Currency · {selectedUser.username}
                </h2>
                <div className="flex flex-wrap gap-4 mb-4">
                  {currencies.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 rounded-lg bg-[#0f0d0b]/50 border border-border text-sm"
                    >
                      <span className="text-muted">{c.currency_type}:</span>{' '}
                      <span className="font-medium text-[#f5efe6]">{c.balance}</span>
                    </div>
                  ))}
                  {currencies.length === 0 && (
                    <p className="text-sm text-muted">No currency records yet.</p>
                  )}
                </div>
                <form onSubmit={handleGrant} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="grant-type" className="block text-xs text-muted mb-1">
                      Type
                    </label>
                    <select
                      id="grant-type"
                      value={grantType}
                      onChange={(e) => setGrantType(e.target.value)}
                      className="min-w-[140px] px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                    >
                      <option value="tickets">tickets</option>
                      <option value="mythic tickets">mythic tickets</option>
                      <option value="shiny mythic tickets">shiny mythic tickets</option>
                      <option value="legendary tickets">legend tickets</option>
                      <option value="shiny legendary tickets">shiny legend tickets</option>
                      <option value="paradox tickets">paradox tickets</option>
                      <option value="shiny paradox tickets">shiny paradox tickets</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="grant-amount" className="block text-xs text-muted mb-1">
                      Amount
                    </label>
                    <input
                      id="grant-amount"
                      type="number"
                      min="1"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      className="w-24 px-2 py-1.5 rounded bg-[#0f0d0b] border border-border text-sm text-[#f5efe6]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={granting}
                    className="px-3 py-1.5 rounded-lg bg-accent text-[#1a1510] text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                  >
                    {granting ? 'Granting…' : 'Grant'}
                  </button>
                </form>
              </div>

              <div className="rounded-lg bg-surface border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-[#f5efe6] m-0">Gacha history · Given in-game</h2>
                  {!historyError ? (
                    <button
                      type="button"
                      onClick={() => setDeleteAllHistoryOpen(true)}
                      className="shrink-0 text-xs py-1.5 px-2.5 rounded border border-error/50 text-error hover:bg-error/15 font-medium"
                      title="Remove every gacha pull for this user from the database"
                    >
                      Delete all history
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted mb-3">
                  Tick when you have given this reward to the user in-game. Use Delete to remove a row from history (e.g. after it’s been handled).
                </p>
                {historyError ? (
                  <p className="text-sm text-error">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted">No gacha pulls yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0f0d0b]/50 border border-border/50"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleFulfilled(entry)}
                          className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            entry.fulfilledAt
                              ? 'bg-emerald/30 border-emerald text-emerald'
                              : 'border-muted hover:border-accent text-transparent'
                          }`}
                          title={entry.fulfilledAt ? 'Mark as not given' : 'Mark as given in-game'}
                        >
                          {entry.fulfilledAt ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-current" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-[#f5efe6]">{entry.rewardType}</span>
                          <span className="block text-xs text-muted">
                            {entry.poolName} · {formatDate(entry.pulledAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(entry)}
                          className="shrink-0 text-xs py-1.5 px-2 rounded border border-error/40 text-error hover:bg-error/15"
                          title="Remove this history entry"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {bulkItemConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-item-title"
          onClick={() => !bulkItemBusy && setBulkItemConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="bulk-item-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Grant items to {bulkIds.length} accounts?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              Each account will receive{' '}
              <span className="text-[#f5efe6] font-medium">
                {Number(bulkItemQty).toLocaleString()} ×{' '}
                {grantableItems.find((i) => i.key === bulkItemKey)?.label ?? bulkItemKey}
              </span>
              . Total items credited:{' '}
              <span className="text-[#f5efe6] font-medium">
                {(Number(bulkItemQty) * bulkIds.length).toLocaleString()}
              </span>
              .
              {bulkNote.trim() ? (
                <>
                  {' '}
                  Note: <span className="text-[#f5efe6]">{bulkNote.trim()}</span>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => !bulkItemBusy && setBulkItemConfirmOpen(false)}
                disabled={bulkItemBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkItemGrant}
                disabled={bulkItemBusy}
                className="px-4 py-2 rounded-lg text-sm bg-accent text-[#1a1510] font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {bulkItemBusy ? 'Granting…' : 'Confirm grant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-cobble-title"
          onClick={() => !bulkBusy && setBulkConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="bulk-cobble-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Grant Cobble$ to {bulkCobbleTargetIds.length} accounts{bulkAllUsers ? ' (all users)' : ''}?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              Each account will receive{' '}
              <span className="text-[#f5efe6] font-medium">
                {Number(bulkAmount).toLocaleString()} Cobble$
              </span>
              . Total credits:{' '}
              <span className="text-[#f5efe6] font-medium">
                {(Number(bulkAmount) * bulkCobbleTargetIds.length).toLocaleString()} Cobble$
              </span>
              .
              {bulkNote.trim() ? (
                <>
                  {' '}
                  Note: <span className="text-[#f5efe6]">{bulkNote.trim()}</span>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => !bulkBusy && setBulkConfirmOpen(false)}
                disabled={bulkBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkGrant}
                disabled={bulkBusy}
                className="px-4 py-2 rounded-lg text-sm bg-accent text-[#1a1510] font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {bulkBusy ? 'Granting…' : 'Confirm grant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAccountOpen && selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => closeDeleteAccount()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Delete user permanently?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              This will remove <strong className="text-[#f5efe6]">{selectedUser.username}</strong> (
              {selectedUser.email}) and all linked website data.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteAccount}
                disabled={deleteAccountBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deleteAccountBusy}
                className="px-4 py-2 rounded-lg text-sm bg-error/20 border border-error/40 text-error hover:bg-error/30 disabled:opacity-50"
              >
                {deleteAccountBusy ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onClick={() => closeDeleteConfirm()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-confirm-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Remove from history?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              This will permanently remove this pull from the user’s gacha history. You can’t undo this.
            </p>
            <div className="rounded-lg bg-[#0f0d0b]/50 border border-border/50 px-3 py-2 mb-6">
              <p className="text-sm font-medium text-[#f5efe6] m-0">{deleteConfirmEntry.rewardType}</p>
              <p className="text-xs text-muted m-0 mt-1">
                {deleteConfirmEntry.poolName} · {formatDate(deleteConfirmEntry.pulledAt)}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteConfirmBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePull}
                disabled={deleteConfirmBusy}
                className="px-4 py-2 rounded-lg text-sm bg-error/20 border border-error/40 text-error hover:bg-error/30 disabled:opacity-50"
              >
                {deleteConfirmBusy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAllHistoryOpen && selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-history-title"
          onClick={() => closeDeleteAllHistory()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface border border-border shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-all-history-title" className="text-lg font-semibold text-[#f5efe6] m-0 mb-2">
              Delete all gacha history?
            </h3>
            <p className="text-sm text-muted m-0 mb-4">
              This removes <strong className="text-[#f5efe6]">every</strong> logged gacha pull for{' '}
              <strong className="text-[#f5efe6]">{selectedUser.username}</strong> from the database—including
              pulls that are not shown in this truncated list. The user&apos;s Gacha page will show no history. You
              can&apos;t undo this.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteAllHistory}
                disabled={deleteAllHistoryBusy}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:bg-surface-hover hover:text-[#f5efe6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteAllHistory()}
                disabled={deleteAllHistoryBusy}
                className="px-4 py-2 rounded-lg text-sm bg-error/20 border border-error/40 text-error hover:bg-error/30 disabled:opacity-50"
              >
                {deleteAllHistoryBusy ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
