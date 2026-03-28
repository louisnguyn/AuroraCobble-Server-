export function ignNamesMatch(viewer: string | null | undefined, name: string): boolean {
  const a = viewer?.trim().toLowerCase()
  const b = name.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

export function scrollElementIntoViewCentered(el: HTMLElement | null) {
  if (!el) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })
}
