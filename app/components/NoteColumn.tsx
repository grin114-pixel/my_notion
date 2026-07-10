'use client'

import { useState, useEffect } from 'react'
import { supabase, TABLES, ensureDefaultFolder, DEFAULT_FOLDER_NAME, swapNotePositions, getNextNoteSortOrder, detectNoteSortOrderSupport, type Note, type Folder } from '@/lib/supabase'
import { PlusIcon, TrashIcon, LinkIcon, EditIcon, ChevronUpIcon, ChevronDownIcon } from './icons'

type Props = {
  notes: Note[]
  folders: Folder[]
  selectedFolder: Folder | null
  defaultFolder: Folder | null
  searchQuery: string
  homeResetToken: number
  onRefresh: () => void
  onFolderRefresh: () => void
  onFolderDeleted: () => void
}

type EditState = {
  id: string
  folderId: string
  title: string
  content: string
  link: string
}

export default function NoteColumn({ notes, folders, selectedFolder, defaultFolder, searchQuery, homeResetToken, onRefresh, onFolderRefresh, onFolderDeleted }: Props) {
  const [isAdding, setIsAdding] = useState(false)
  const [addFolderId, setAddFolderId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [link, setLink] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [editError, setEditError] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [isEditingFolder, setIsEditingFolder] = useState(false)
  const [folderEditName, setFolderEditName] = useState('')
  const [folderEditLoading, setFolderEditLoading] = useState(false)
  const [folderDeleteLoading, setFolderDeleteLoading] = useState(false)
  const [reorderLoading, setReorderLoading] = useState<string | null>(null)

  const filtered = notes.filter((n) => {
    const q = searchQuery.toLowerCase()
    return (
      n.content.toLowerCase().includes(q) ||
      (n.title ?? '').toLowerCase().includes(q) ||
      (n.link ?? '').toLowerCase().includes(q)
    )
  })

  const canReorder = !searchQuery

  const openAddForm = () => {
    setEditState(null)
    setAddFolderId(selectedFolder?.id ?? defaultFolder?.id ?? '')
    setIsAdding(true)
  }

  const resetAddForm = () => {
    setIsAdding(false)
    setAddFolderId('')
    setTitle('')
    setContent('')
    setLink('')
  }

  const handleAdd = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setAddLoading(true)

    let folderId = addFolderId
    if (!folderId) {
      const defaultF = await ensureDefaultFolder()
      folderId = defaultF?.id ?? ''
    }
    if (!folderId) {
      setAddLoading(false)
      return
    }

    const sortOrderSupported = await detectNoteSortOrderSupport()
    const payload: {
      folder_id: string
      title: string
      content: string
      link: string | null
      sort_order?: number
    } = {
      folder_id: folderId,
      title: trimmedTitle,
      content: content.trim(),
      link: link.trim() || null,
    }
    if (sortOrderSupported) {
      payload.sort_order = await getNextNoteSortOrder(folderId)
    }

    const { error } = await supabase.from(TABLES.notes).insert(payload)
    if (!error) {
      resetAddForm()
      onRefresh()
    }
    setAddLoading(false)
  }

  const startEdit = (note: Note) => {
    setEditState({
      id: note.id,
      folderId: note.folder_id,
      title: note.title ?? '',
      content: note.content,
      link: note.link ?? '',
    })
  }

  const handleEdit = async () => {
    if (!editState) return
    const trimmedTitle = editState.title.trim()
    if (!trimmedTitle) return
    setEditError('')
    setEditLoading(true)

    let folderId = editState.folderId
    if (!folderId) {
      const defaultF = await ensureDefaultFolder()
      folderId = defaultF?.id ?? ''
    }
    if (!folderId) {
      setEditError('폴더를 선택해주세요.')
      setEditLoading(false)
      return
    }

    const { error } = await supabase
      .from(TABLES.notes)
      .update({
        folder_id: folderId,
        title: trimmedTitle,
        content: editState.content.trim(),
        link: editState.link.trim() || null,
      })
      .eq('id', editState.id)
      .select()

    if (error) {
      console.error('노트 수정 오류:', error)
      setEditError('저장 실패: ' + (error.message ?? '알 수 없는 오류'))
    } else {
      setEditState(null)
      setEditError('')
      onRefresh()
    }
    setEditLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 노트를 삭제할까요?')) return
    setDeleteLoading(id)
    const { error } = await supabase.from(TABLES.notes).delete().eq('id', id)
    if (!error) onRefresh()
    setDeleteLoading(null)
  }

  const canEditFolder = selectedFolder && selectedFolder.name !== DEFAULT_FOLDER_NAME

  useEffect(() => {
    setIsEditingFolder(false)
  }, [selectedFolder?.id])

  useEffect(() => {
    if (homeResetToken === 0) return
    setIsAdding(false)
    setAddFolderId('')
    setTitle('')
    setContent('')
    setLink('')
    setEditState(null)
    setEditError('')
    setIsEditingFolder(false)
    setFolderEditName('')
  }, [homeResetToken])

  const startFolderEdit = () => {
    if (!selectedFolder) return
    setIsAdding(false)
    setEditState(null)
    setFolderEditName(selectedFolder.name)
    setIsEditingFolder(true)
  }

  const handleFolderEdit = async () => {
    if (!selectedFolder) return
    const trimmed = folderEditName.trim()
    if (!trimmed) return
    setFolderEditLoading(true)
    const { error } = await supabase
      .from(TABLES.folders)
      .update({ name: trimmed })
      .eq('id', selectedFolder.id)
      .select()
    if (!error) {
      setIsEditingFolder(false)
      onFolderRefresh()
    }
    setFolderEditLoading(false)
  }

  const handleFolderDelete = async () => {
    if (!selectedFolder) return
    if (!confirm('이 폴더를 삭제하면 하위 노트도 모두 삭제됩니다. 계속할까요?')) return
    setFolderDeleteLoading(true)
    const { error } = await supabase.from(TABLES.folders).delete().eq('id', selectedFolder.id)
    if (!error) onFolderDeleted()
    setFolderDeleteLoading(false)
  }

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    if (!canReorder) return
    const index = filtered.findIndex((n) => n.id === id)
    if (index === -1) return
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= filtered.length) return

    const current = filtered[index]
    const neighbor = filtered[swapIndex]

    setReorderLoading(id)
    const { error } = await swapNotePositions(current, neighbor)
    if (!error) onRefresh()
    setReorderLoading(null)
  }

  return (
    <main className="flex flex-col h-full min-h-0 bg-brand-50/40">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-brand-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditingFolder && selectedFolder ? (
            <span className="text-sm font-medium text-brand-600">폴더 이름 수정</span>
          ) : (
            <>
              <h2 className="font-semibold text-gray-700 text-sm tracking-wide uppercase truncate">
                {selectedFolder ? selectedFolder.name : '전체보기'}
                <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length})</span>
              </h2>
              {canEditFolder && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={startFolderEdit}
                    className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-500 transition-colors"
                    title="폴더 수정"
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    onClick={handleFolderDelete}
                    disabled={folderDeleteLoading}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                    title="폴더 삭제"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white bg-brand-500 hover:bg-brand-600 transition-colors shrink-0"
        >
          <PlusIcon />
          <span>노트 추가</span>
        </button>
      </div>

      {isEditingFolder && selectedFolder && (
        <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 shrink-0">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={folderEditName}
              onChange={(e) => setFolderEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFolderEdit()
                if (e.key === 'Escape') setIsEditingFolder(false)
              }}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
            />
            <button
              onClick={handleFolderEdit}
              disabled={folderEditLoading || !folderEditName.trim()}
              className="shrink-0 px-4 py-2 rounded-lg text-sm text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 font-medium"
            >
              {folderEditLoading ? '저장 중...' : '확인'}
            </button>
            <button
              onClick={() => setIsEditingFolder(false)}
              disabled={folderEditLoading}
              className="shrink-0 px-4 py-2 rounded-lg text-sm text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 font-medium"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 추가 폼 */}
      {isAdding && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-white border border-brand-200 shadow-sm">
          <p className="text-xs font-medium text-brand-600 mb-3">새 노트 추가</p>
          <select
            value={addFolderId}
            onChange={(e) => setAddFolderId(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 mb-2 bg-white"
          >
            {folders.length === 0 ? (
              <option value="">{DEFAULT_FOLDER_NAME}</option>
            ) : (
              folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))
            )}
          </select>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 mb-2"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용 (선택사항)"
            rows={3}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          />
          <div className="relative mt-2">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
              <LinkIcon />
            </div>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="링크 (선택사항)"
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAdd}
              disabled={addLoading || !title.trim()}
              className="flex-1 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {addLoading ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={resetAddForm}
              disabled={addLoading}
              className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="48" height="48" className="mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">노트가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((note, index) =>
              editState?.id === note.id ? (
                /* 수정 폼 (노트 자리에 인라인으로 표시) */
                <div key={note.id} className="bg-white rounded-xl border border-brand-300 p-4 shadow-sm col-span-1">
                  <p className="text-xs font-medium text-brand-600 mb-3">노트 수정</p>
                  <select
                    value={editState.folderId}
                    onChange={(e) => setEditState({ ...editState, folderId: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 mb-2 bg-white"
                  >
                    {folders.length === 0 ? (
                      <option value="">{DEFAULT_FOLDER_NAME}</option>
                    ) : (
                      folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))
                    )}
                  </select>
                  <input
                    autoFocus
                    type="text"
                    value={editState.title}
                    onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                    placeholder="제목"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 mb-2"
                  />
                  <textarea
                    value={editState.content}
                    onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                    placeholder="내용 (선택사항)"
                    rows={3}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  />
                  <div className="relative mt-2">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                      <LinkIcon />
                    </div>
                    <input
                      type="url"
                      value={editState.link}
                      onChange={(e) => setEditState({ ...editState, link: e.target.value })}
                      placeholder="링크 (선택사항)"
                      className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  {editError && (
                    <p className="mt-2 text-xs text-red-500">{editError}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleEdit}
                      disabled={editLoading || !editState.title.trim()}
                      className="flex-1 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
                    >
                      {editLoading ? '저장 중...' : '저장'}
                    </button>
                    <button
                      onClick={() => { setEditState(null); setEditError('') }}
                      disabled={editLoading}
                      className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                /* 노트 보기 */
                <div
                  key={note.id}
                  className="group relative bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all overflow-hidden"
                >
                  <div className="absolute top-3 right-3 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                    {canReorder && (
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMove(note.id, 'up')}
                          disabled={index <= 0 || reorderLoading === note.id}
                          className="p-0.5 rounded text-gray-300 hover:text-brand-500 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="위로"
                        >
                          <ChevronUpIcon size={12} />
                        </button>
                        <button
                          onClick={() => handleMove(note.id, 'down')}
                          disabled={index >= filtered.length - 1 || reorderLoading === note.id}
                          className="p-0.5 rounded text-gray-300 hover:text-brand-500 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="아래로"
                        >
                          <ChevronDownIcon size={12} />
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => { startEdit(note); setIsAdding(false) }}
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-500 transition-all"
                      title="수정"
                    >
                      <EditIcon size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={deleteLoading === note.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 disabled:opacity-50 transition-all"
                      title="삭제"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                  {note.title && (
                    <div className="-mx-4 -mt-4 mb-3 px-4 py-2.5 bg-brand-50 border-b border-brand-100">
                      <p className="text-sm font-semibold text-gray-900 pr-16 truncate">{note.title}</p>
                    </div>
                  )}
                  {note.content && (
                    <p className="text-sm text-gray-600 leading-relaxed pr-16 whitespace-pre-wrap">{note.content}</p>
                  )}
                  {note.link && (
                    <a
                      href={note.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 hover:underline truncate"
                    >
                      <LinkIcon />
                      <span className="truncate">{note.link}</span>
                    </a>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  )
}
