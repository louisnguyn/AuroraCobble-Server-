/** Website inventory / shop item keys → display names (Account inventory, wallet ledger). */
const INVENTORY_ITEM_LABELS: Record<string, string> = {
  exp_candy_xl: 'EXP Candy XL',
  silver_bottle_cap: 'Silver Bottle Cap',
  gold_bottle_cap: 'Silver Bottle Cap',
  master_ball: 'Master Ball',
  ancient_origin_ball: 'Ancient Origin Ball',
}

export function displayInventoryItemName(key: string): string {
  const k = key.trim().toLowerCase()
  if (INVENTORY_ITEM_LABELS[k]) return INVENTORY_ITEM_LABELS[k]
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Humanize ledger detail lines (shop purchases, legacy keys). */
export function formatWalletLedgerDetail(detail: string | null | undefined): string {
  if (!detail?.trim()) return '—'
  let out = detail
  for (const [key, label] of Object.entries(INVENTORY_ITEM_LABELS)) {
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    out = out.replace(re, label)
  }
  out = out.replace(/Gold Bottle Cap/gi, 'Silver Bottle Cap')
  return out
}
