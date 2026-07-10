'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, TABLES, ensureDefaultFolder, ensureFolderSortOrders, detectFolderSortOrderSupport, sortFolders, detectNoteSortOrderSupport, ensureNoteSortOrders, sortNotes, DEFAULT_FOLDER_NAME, type Folder, type Note } from '@/lib/supabase'
import FolderColumn from './components/FolderColumn'
import NoteColumn from './components/NoteColumn'
import { SearchIcon, XIcon, RefreshIcon } from './components/icons'

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [homeResetToken, setHomeResetToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const selectedFolder = folders.find((f) => f.id === selectedId) ?? null
  const defaultFolder = folders.find((f) => f.name === DEFAULT_FOLDER_NAME) ?? null

  const fetchFolders = useCallback(async () => {
    const sortOrderSupported = await detectFolderSortOrderSupport()
    const orderColumn = sortOrderSupported ? 'sort_order' : 'created_at'
    const { data, error } = await supabase
      .from(TABLES.folders)
      .select('*')
      .order(orderColumn, { ascending: true })
    if (error) console.error('folders fetch error:', error)
    if (data) {
      if (sortOrderSupported) {
        await ensureFolderSortOrders(data)
        const { data: refreshed } = await supabase
          .from(TABLES.folders)
          .select('*')
          .order('sort_order', { ascending: true })
        setFolders(sortFolders(refreshed ?? data))
      } else {
        setFolders(sortFolders(data))
      }
    }
  }, [])

  const fetchNotes = useCallback(async () => {
    const sortOrderSupported = await detectNoteSortOrderSupport()
    const orderColumn = sortOrderSupported ? 'sort_order' : 'created_at'
    const ascending = sortOrderSupported
    let query = supabase.from(TABLES.notes).select('*').order(orderColumn, { ascending })
    if (selectedId && !searchQuery) {
      query = query.eq('folder_id', selectedId)
    }
    const { data } = await query
    if (data) {
      if (sortOrderSupported) {
        await ensureNoteSortOrders(data)
        let refreshedQuery = supabase.from(TABLES.notes).select('*').order('sort_order', { ascending: true })
        if (selectedId && !searchQuery) {
          refreshedQuery = refreshedQuery.eq('folder_id', selectedId)
        }
        const { data: refreshed } = await refreshedQuery
        setNotes(sortNotes(refreshed ?? data))
      } else {
        setNotes(data)
      }
    }
  }, [selectedId, searchQuery])

  // 최초 로드 시 딱 한 번만 미분류 폴더 보장
  useEffect(() => {
    ensureDefaultFolder().then(() => fetchFolders())
  }, [fetchFolders])
  useEffect(() => { fetchNotes() }, [fetchNotes])

  const handleSelectFolder = (id: string) => {
    setSelectedId(id)
    setSearchQuery('')
  }

  const handleSelectAll = () => {
    setSelectedId(null)
    setSearchQuery('')
  }

  const handleGoHome = () => {
    setSelectedId(null)
    setSearchQuery('')
    setHomeResetToken((t) => t + 1)
  }

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchFolders(), fetchNotes()])
    } finally {
      setRefreshing(false)
    }
  }, [fetchFolders, fetchNotes])

  const displayedNotes = searchQuery
    ? notes.filter((n) => {
        const q = searchQuery.toLowerCase()
        return n.content.toLowerCase().includes(q) || (n.link ?? '').toLowerCase().includes(q)
      })
    : notes

  return (
    <div className="app-shell flex flex-col h-screen bg-brand-50/40">
      {/* 헤더 */}
      <header className="flex items-center gap-2 px-3 py-3 bg-white border-b border-brand-100 shadow-sm z-10">
        {/* 앱 로고/타이틀 */}
        <button
          type="button"
          onClick={handleGoHome}
          className="flex items-center gap-2 shrink-0 rounded-lg px-1 py-0.5 hover:bg-brand-50 active:bg-brand-100 transition-colors cursor-pointer"
          aria-label="홈으로"
          title="홈으로"
        >
          <img
            src="/icon-192.png"
            alt="My Notion"
            width={28}
            height={28}
            className="w-7 h-7 rounded-[6px] select-none pointer-events-none"
            draggable={false}
          />
          <h1 className="text-lg font-bold text-brand-600 tracking-tight hidden sm:block pointer-events-none">My Notion</h1>
        </button>

        {/* 검색창 */}
        <div className="flex-1 max-w-xl mx-auto relative min-w-0">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (e.target.value) setSelectedId(null)
            }}
            placeholder="노트 검색..."
            className="w-full pl-10 pr-9 py-2 text-sm rounded-xl border border-brand-100 bg-brand-50/60 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <XIcon />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-white bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-60 shadow-sm transition-all"
          aria-label="새로고침"
          title="새로고침"
        >
          <span className={refreshing ? 'animate-spin' : undefined}>
            <RefreshIcon size={14} />
          </span>
        </button>
      </header>

      {/* 바디: 2열 레이아웃 */}
      <div className="app-body flex flex-1 min-h-0 overflow-hidden">
        {/* 1열: 폴더 */}
        <div className="app-sidebar shrink-0 h-full overflow-hidden">
          <FolderColumn
            folders={folders}
            selectedId={selectedId}
            onSelectAll={handleSelectAll}
            onSelect={handleSelectFolder}
            onRefresh={() => { fetchFolders(); fetchNotes() }}
          />
        </div>

        {/* 2열: 노트 */}
        <div className="app-main flex-1 min-w-0 min-h-0 overflow-hidden">
          <NoteColumn
            notes={displayedNotes}
            folders={folders}
            selectedFolder={selectedFolder}
            defaultFolder={defaultFolder}
            searchQuery={searchQuery}
            homeResetToken={homeResetToken}
            onRefresh={fetchNotes}
            onFolderRefresh={handleRefreshAll}
            onFolderDeleted={() => { setSelectedId(null); fetchFolders(); fetchNotes() }}
          />
        </div>
      </div>
    </div>
  )
}
