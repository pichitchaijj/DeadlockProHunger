'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { CloseIcon } from './icons'
import { IconButton } from './IconButton'

type Placement = 'center' | 'bottom' | 'right'

export type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Action row, e.g. Cancel / Apply buttons. */
  footer?: ReactNode
  className?: string
}

const placements: Record<Placement, string> = {
  center:
    'm-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-4rem)] rounded-md animate-scale-in',
  bottom:
    'mt-auto mb-0 mx-0 w-full max-w-none max-h-[85dvh] rounded-t-lg animate-awaken pb-[env(safe-area-inset-bottom)]',
  right:
    'ml-auto mr-0 my-0 h-dvh max-h-none w-[min(26rem,100vw)] rounded-l-md animate-slide-in pb-[env(safe-area-inset-bottom)]',
}

/**
 * Keeps a native <dialog> in sync with `open` using showModal()/close().
 * showModal() gives focus containment, Escape (cancel event), an inert background
 * and focus return to the previously focused element.
 */
export function useModalDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return ref
}

/**
 * Shared base for Modal and Drawer, built on the native <dialog> element:
 * showModal() gives focus containment, Escape to close, an inert background
 * and focus return to the trigger.
 */
function DialogBase({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  placement,
}: DialogProps & { placement: Placement }) {
  const ref = useModalDialog(open)
  const titleId = useId()
  const descriptionId = useId()

  return (
    // Backdrop click is a pointer convenience; Escape (onCancel) is the keyboard equivalent.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose()
      }}
      className={cx(
        'flex-col border border-border-strong bg-surface p-0 text-text shadow-overlay open:flex',
        'backdrop:bg-bg/75 backdrop:backdrop-blur-[2px]',
        placements[placement],
        className,
      )}
    >
      <header className="flex items-start gap-4 border-b border-border px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-display-m font-bold uppercase">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-text-muted">
              {description}
            </p>
          )}
        </div>
        <IconButton label="Close" icon={<CloseIcon />} onClick={onClose} className="-mt-1 -mr-2" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          {footer}
        </footer>
      )}
    </dialog>
  )
}

/** Centered modal for confirmations and focused tasks. */
export function Modal(props: DialogProps) {
  return <DialogBase placement="center" {...props} />
}

export type DrawerProps = DialogProps & {
  /** `bottom` = mobile sheet (filters), `right` = side panel on larger screens. */
  side?: 'bottom' | 'right'
}

/** Sheet / side panel, e.g. the full filter set on mobile. */
export function Drawer({ side = 'bottom', ...props }: DrawerProps) {
  return <DialogBase placement={side} {...props} />
}
