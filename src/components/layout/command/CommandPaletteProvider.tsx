'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { CommandPalette } from './CommandPalette'

type CommandPaletteContextValue = {
  open: () => void
  /** "Ctrl K" or "⌘K", resolved after mount to avoid a hydration mismatch. */
  shortcutLabel: string
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette() {
  const value = useContext(CommandPaletteContext)
  if (!value) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return value
}

const noSubscribe = () => () => {}
const clientShortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')
const serverShortcut = () => 'Ctrl K'

/** Owns the palette's open state and the global Ctrl+K / ⌘K shortcut. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  // Server renders "Ctrl K"; the client switches to "⌘K" on Apple devices without a hydration mismatch.
  const shortcutLabel = useSyncExternalStore(noSubscribe, clientShortcut, serverShortcut)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault() // stops the browser's own Ctrl+K (address-bar search)
        setIsOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ open, shortcutLabel }}>
      {children}
      <CommandPalette open={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  )
}
