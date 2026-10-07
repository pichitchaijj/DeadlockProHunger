import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'

/**
 * Behavior for a disclosure menu (APG disclosure navigation pattern): a button with aria-expanded
 * controlling a list of links. Escape closes and returns focus to the button; ↓/↑ move between the
 * links marked with `itemAttr`; clicking outside or tabbing away closes.
 * Spread `rootProps` on the wrapper around the button and the panel.
 */
export function useDisclosureMenu(itemAttr: string) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = [...(rootRef.current?.querySelectorAll<HTMLAnchorElement>(`[${itemAttr}]`) ?? [])]
    if (!open || links.length === 0) return
    event.preventDefault()
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % links.length : (index - 1 + links.length) % links.length
    links[next].focus()
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }

  return { open, setOpen, buttonRef, rootProps: { ref: rootRef, onKeyDown, onBlur } }
}
