'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer, Modal } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { FilterIcon, InfoIcon } from '@/components/ui/icons'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { Tooltip } from '@/components/ui/Tooltip'

/** Client-side demos for the /design page (interactive components only). */
export function InteractiveDemos() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tags, setTags] = useState(['Lane: Solo', 'Window: 7 days'])

  return (
    <div className="grid gap-10">
      <div className="grid gap-6 md:grid-cols-2">
        <form action="/design" role="search">
          <SearchInput
            label="Search players"
            name="q"
            placeholder="Name, SteamID or profile URL"
            hint="Try a player name or a SteamID3."
          />
        </form>
        <div className="flex flex-col gap-2">
          <span className="text-eyebrow">Active filters (Tag with remove)</span>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Tag key={tag} onRemove={() => setTags((all) => all.filter((t) => t !== tag))}>
                {tag}
              </Tag>
            ))}
            {tags.length === 0 && <span className="text-sm text-text-muted">No filters</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Button variant="secondary" leadingIcon={<FilterIcon size={18} />} onClick={() => setDrawerOpen(true)}>
          Open filter drawer
        </Button>
        <Tooltip content="Win rate is shown with a 95% Wilson interval.">
          <IconButton label="About win rate" icon={<InfoIcon />} variant="outline" />
        </Tooltip>
      </div>

      <Tabs
        label="Hero sections (demo)"
        items={[
          { value: 'overview', label: 'Overview', content: <DemoPanel text="Overview panel: key insight cards go here." /> },
          { value: 'matchups', label: 'Matchups', content: <DemoPanel text="Matchups panel: best and worst opponents." /> },
          { value: 'items', label: 'Items', content: <DemoPanel text="Items panel: core items by timing." /> },
          { value: 'builds', label: 'Builds', content: <DemoPanel text="Builds panel: community builds." /> },
        ]}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Reset filters?"
        description="This returns every filter to its default preset."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Reset</Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">Rank band returns to All ranks and window to Last 7 days.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        description="Full filter set (bottom sheet on mobile)."
        footer={<Button onClick={() => setDrawerOpen(false)}>Apply</Button>}
      >
        <p className="text-sm text-text-muted">Rank band, window and mode presets render here.</p>
      </Drawer>
    </div>
  )
}

function DemoPanel({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-text-muted">{text}</p>
}
