'use client'

import { useState } from 'react'
import { DEFAULT_FOLDER_NAME, insertFolder, type Folder } from '@/lib/supabase'
import { PlusIcon, FolderIcon, AllIcon } from './icons'

type Props = {
  folders: Folder[]
  selectedId: string | null
  onSelectAll: () => void
  onSelect: (id: string) => void
  onRefresh: () => void
}

export default function FolderColumn({ folders, selectedId, onSelectAll, onSelect, onRefresh }: Props) {
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const reorderable = folders.filter((f) => f.name !== DEFAULT_FOLDER_NAME)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setAddLoading(true)
    setErrorMsg('')
    const maxOrder = reorderable.reduce((max, f) => Math.max(max, f.sort_order ?? 0), -1)
    const { error } = await insertFolder(trimmed, maxOrder + 1)
    if (!error) {
      setNewName('')
      setIsAdding(false)
      onRefresh()
    } else {
      console.error('폴더 추가 오류:', error)
      setErrorMsg(error || '추가 실패. 콘솔을 확인하세요.')
    }
    setAddLoading(false)
  }

  return (
    <aside className="folder-sidebar relative inline-flex flex-col h-full min-h-0 max-w-full overflow-hidden bg-white border-r border-brand-100">
      <button
        type="button"
        onClick={onSelectAll}
        className={`flex items-center gap-1.5 px-2 h-12 w-full border-b border-brand-100 shrink-0 text-left text-sm transition-colors ${
          selectedId === null
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
        }`}
        aria-label="전체보기"
        title="전체보기"
      >
        <span className="shrink-0">
          <AllIcon active={selectedId === null} />
        </span>
        <span className="truncate font-semibold tracking-wide">전체보기</span>
      </button>

      {errorMsg && (
        <div className="mx-1.5 mt-1.5 px-2 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
          ⚠️ {errorMsg}
        </div>
      )}

      {isAdding && (
        <div className="px-2 py-2.5 border-b border-brand-100 bg-brand-50">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setIsAdding(false); setNewName('') }
            }}
            placeholder="이름"
            className="w-full text-sm px-2 py-2 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-0"
          />
          <div className="flex gap-1 mt-2">
            <button
              onClick={handleAdd}
              disabled={addLoading || !newName.trim()}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {addLoading ? '...' : '추가'}
            </button>
            <button
              onClick={() => { setIsAdding(false); setNewName('') }}
              disabled={addLoading}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-gray-200 text-gray-600 font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto overflow-x-hidden py-0 pb-16 min-h-0">
        {folders.length === 0 && (
          <li className="px-2 py-4 text-gray-400 text-xs">
            추가해보세요
          </li>
        )}
        {folders.map((folder) => {
          const isSelected = selectedId === folder.id

          return (
            <li
              key={folder.id}
              className={`flex items-center min-h-11 ${
                isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
              }`}
            >
              <button
                onClick={() => onSelect(folder.id)}
                className={`flex-1 flex items-center gap-1.5 px-2 h-11 text-left text-sm transition-colors min-w-0 ${
                  isSelected
                    ? 'text-brand-700 font-medium'
                    : 'text-gray-700'
                }`}
              >
                <span className="shrink-0">
                  <FolderIcon active={isSelected} />
                </span>
                <span className="truncate" title={folder.name}>{folder.name}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {!isAdding && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-11 h-11 rounded-full text-white bg-brand-500 hover:bg-brand-600 shadow-lg active:scale-95 transition-all"
          title="폴더 추가"
          aria-label="폴더 추가"
        >
          <PlusIcon />
        </button>
      )}
    </aside>
  )
}
