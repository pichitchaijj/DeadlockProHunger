'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type InputHTMLAttributes } from 'react'
import { cx } from '@/lib/cx'
import { CloseIcon, SearchIcon } from './icons'

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** Visible or visually hidden label; required for accessibility. */
  label: string
  hideLabel?: boolean
  /** Optional hint under the field, e.g. accepted formats. */
  hint?: string
  onClear?: () => void
}

/**
 * Search field with icon, clear button and Escape-to-clear.
 * Works inside a plain <form> (GET) without any extra JS wiring.
 */
export function SearchInput({
  label,
  hideLabel = false,
  hint,
  onClear,
  className,
  defaultValue,
  value,
  onChange,
  ...props
}: SearchInputProps) {
  const id = useId()
  const t = useTranslations('common')
  const inputRef = useRef<HTMLInputElement>(null)
  const [hasValue, setHasValue] = useState(Boolean(value ?? defaultValue))

  function clear() {
    const input = inputRef.current
    if (!input) return
    if (value === undefined) input.value = ''
    setHasValue(false)
    onClear?.()
    input.focus()
  }

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cx('text-eyebrow', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          defaultValue={defaultValue}
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            setHasValue(event.target.value.length > 0)
            onChange?.(event)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && hasValue) {
              event.preventDefault()
              clear()
            }
          }}
          className={cx(
            'h-11 w-full rounded-sm border border-border-control bg-surface-sunken pr-11 pl-10',
            'font-ui text-body text-text placeholder:text-text-muted/80',
            'transition-[border-color,box-shadow] duration-(--dur-fast) ease-awaken',
            'hover:border-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:shadow-glow',
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
          {...props}
        />
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            aria-label={t('clearSearch')}
            className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-text-muted hover:bg-surface-raised hover:text-text"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
