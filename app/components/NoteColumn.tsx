'use client'

import { useState, useEffect, useRef, useLayoutEffect, type RefObject } from 'react'
import { supabase, TABLES, ensureDefaultFolder, DEFAULT_FOLDER_NAME, swapNotePositions, swapFolderPositions, getNextNoteSortOrder, detectNoteSortOrderSupport, uploadNoteImage, isNoteImageUrl, parseNoteImages, collectNoteImageUrls, deleteNoteImagesFromStorage, deleteNoteWithImages, deleteFolderWithNoteImages, type Note, type Folder } from '@/lib/supabase'
import { PlusIcon, TrashIcon, LinkIcon, ImageIcon, EditIcon, ChevronUpIcon, ChevronDownIcon } from './icons'
import PullToRefresh from './PullToRefresh'
import NoteContent from './NoteContent'

type Props = {
  notes: Note[]
  folders: Folder[]
  selectedFolder: Folder | null
  defaultFolder: Folder | null
  searchQuery: string
  homeResetToken: number
  onRefresh: () => void
  onFolderRefresh: () => void | Promise<void>
  onFolderDeleted: () => void
}

type EditState = {
  id: string
  folderId: string
  title: string
  content: string
}

function insertImageMarkdown(content: string, url: string, cursor: number): { next: string; cursor: number } {
  const before = content.slice(0, cursor)
  const after = content.slice(cursor)
  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n')
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n')
  const block = `${needsLeadingNewline ? '\n' : ''}![](${url})${needsTrailingNewline ? '\n' : ''}`
  return {
    next: before + block + after,
    cursor: before.length + block.length,
  }
}

function ImageInsertButton({
  textareaRef,
  value,
  onChange,
  disabled,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setLocalError('')
    setUploading(true)

    const el = textareaRef.current
    let nextValue = value
    let cursor = el?.selectionStart ?? value.length
    const errors: string[] = []

    for (const file of Array.from(fileList)) {
      const { url, error: uploadError } = await uploadNoteImage(file)
      if (uploadError || !url) {
        errors.push(uploadError || `${file.name} 첨부 실패`)
        continue
      }
      const inserted = insertImageMarkdown(nextValue, url, cursor)
      nextValue = inserted.next
      cursor = inserted.cursor
    }

    onChange(nextValue)
    if (errors.length > 0) setLocalError(errors[0])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''

    requestAnimationFrame(() => {
      const target = textareaRef.current
      if (!target) return
      target.focus()
      target.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/40 disabled:opacity-50 transition-colors"
      >
        <ImageIcon size={15} />
        {uploading ? '이미지 넣는 중...' : '커서 위치에 이미지 넣기'}
      </button>
      <p className="mt-1 text-[11px] text-gray-400">원하는 글 위치를 누른 뒤 이미지를 넣으면 그 자리에 들어갑니다.</p>
      {localError && <p className="mt-1.5 text-xs text-red-500">{localError}</p>}
    </div>
  )
}

function NoteAttachedMedia({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)

  if (failed || !isNoteImageUrl(src)) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 hover:underline max-w-full"
      >
        <LinkIcon />
        <span className="truncate min-w-0">{src}</span>
      </a>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="note-card-image"
      onError={() => setFailed(true)}
    />
  )
}

function LegacyNoteImages({ link, content }: { link: string | null; content: string }) {
  const images = parseNoteImages(link).filter((src) => !content.includes(`](${src})`))
  if (images.length === 0) return null
  return (
    <div className="note-card-images">
      {images.map((src, index) => (
        <NoteAttachedMedia key={`${index}-${src.slice(0, 40)}`} src={src} />
      ))}
    </div>
  )
}

export default function NoteColumn({ notes, folders, selectedFolder, defaultFolder, searchQuery, homeResetToken, onRefresh, onFolderRefresh, onFolderDeleted }: Props) {
  const [isAdding, setIsAdding] = useState(false)
  const [addFolderId, setAddFolderId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editError, setEditError] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [isEditingFolder, setIsEditingFolder] = useState(false)
  const [folderEditName, setFolderEditName] = useState('')
  const [folderEditLoading, setFolderEditLoading] = useState(false)
  const [folderDeleteLoading, setFolderDeleteLoading] = useState(false)
  const [folderReorderLoading, setFolderReorderLoading] = useState(false)
  const [reorderLoading, setReorderLoading] = useState<string | null>(null)
  const editContentRef = useRef<HTMLTextAreaElement>(null)
  const addContentRef = useRef<HTMLTextAreaElement>(null)

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
    setAddError('')
    setAddFolderId(selectedFolder?.id ?? defaultFolder?.id ?? '')
    setIsAdding(true)
  }

  const resetAddForm = () => {
    setIsAdding(false)
    setAddFolderId('')
    setTitle('')
    setContent('')
    setAddError('')
  }

  const handleAdd = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setAddError('제목을 입력해주세요.')
      return
    }
    setAddError('')
    setAddLoading(true)

    try {
      let folderId = addFolderId
      if (!folderId) {
        const defaultF = await ensureDefaultFolder()
        folderId = defaultF?.id ?? ''
      }
      if (!folderId) {
        setAddError('폴더를 선택해주세요.')
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
        link: null,
      }
      if (sortOrderSupported) {
        payload.sort_order = await getNextNoteSortOrder(folderId)
      }

      const { error } = await supabase.from(TABLES.notes).insert(payload)
      if (error) {
        console.error('노트 추가 오류:', error)
        setAddError('저장 실패: ' + (error.message ?? '알 수 없는 오류'))
        return
      }

      resetAddForm()
      void onRefresh()
    } catch (err) {
      console.error('노트 추가 오류:', err)
      setAddError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setAddLoading(false)
    }
  }

  const startEdit = (note: Note) => {
    let nextContent = note.content ?? ''
    const legacyImages = parseNoteImages(note.link)
    for (const url of legacyImages) {
      if (!nextContent.includes(url)) {
        nextContent = `${nextContent}${nextContent && !nextContent.endsWith('\n') ? '\n\n' : ''}![](${url})`
      }
    }
    setEditState({
      id: note.id,
      folderId: note.folder_id,
      title: note.title ?? '',
      content: nextContent,
    })
  }

  const handleEdit = async () => {
    if (!editState) return
    const trimmedTitle = editState.title.trim()
    if (!trimmedTitle) {
      setEditError('제목을 입력해주세요.')
      return
    }
    setEditError('')
    setEditLoading(true)

    try {
      let folderId = editState.folderId
      if (!folderId) {
        const defaultF = await ensureDefaultFolder()
        folderId = defaultF?.id ?? ''
      }
      if (!folderId) {
        setEditError('폴더를 선택해주세요.')
        return
      }

      const previousNote = notes.find((n) => n.id === editState.id)
      const previousImages = previousNote ? collectNoteImageUrls(previousNote) : []
      const nextImages = collectNoteImageUrls({ content: editState.content, link: null })
      const removedImages = previousImages.filter((url) => !nextImages.includes(url))

      const { error } = await supabase
        .from(TABLES.notes)
        .update({
          folder_id: folderId,
          title: trimmedTitle,
          content: editState.content.trim(),
          link: null,
        })
        .eq('id', editState.id)
        .select()

      if (error) {
        console.error('노트 수정 오류:', error)
        setEditError('저장 실패: ' + (error.message ?? '알 수 없는 오류'))
        return
      }

      setEditState(null)
      setEditError('')
      void onRefresh()
      if (removedImages.length > 0) {
        void deleteNoteImagesFromStorage(removedImages)
      }
    } catch (err) {
      console.error('노트 수정 오류:', err)
      setEditError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setEditLoading(false)
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
  }

  const cancelDelete = () => {
    if (deleteLoading) return
    setPendingDeleteId(null)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setDeleteLoading(id)
    const note = notes.find((n) => n.id === id)
    const { error } = note
      ? await deleteNoteWithImages(note)
      : await (async () => {
          const { error: deleteError } = await supabase.from(TABLES.notes).delete().eq('id', id)
          return { error: deleteError?.message }
        })()
    if (!error) onRefresh()
    setDeleteLoading(null)
    setPendingDeleteId(null)
  }

  const canEditFolder = selectedFolder && selectedFolder.name !== DEFAULT_FOLDER_NAME
  const reorderableFolders = folders.filter((f) => f.name !== DEFAULT_FOLDER_NAME)
  const folderReorderIndex = selectedFolder
    ? reorderableFolders.findIndex((f) => f.id === selectedFolder.id)
    : -1
  const canReorderFolder = Boolean(canEditFolder && folderReorderIndex >= 0)

  useEffect(() => {
    setIsEditingFolder(false)
  }, [selectedFolder?.id])

  useEffect(() => {
    if (homeResetToken === 0) return
    setIsAdding(false)
    setAddFolderId('')
    setTitle('')
    setContent('')
    setAddError('')
    setEditState(null)
    setEditError('')
    setPendingDeleteId(null)
    setIsEditingFolder(false)
    setFolderEditName('')
  }, [homeResetToken])

  useLayoutEffect(() => {
    const el = editContentRef.current
    if (!el || !editState) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`
  }, [editState?.id, editState?.content])

  useLayoutEffect(() => {
    if (!isAdding) return
    const el = addContentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`
  }, [isAdding, content])

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
    const { error } = await deleteFolderWithNoteImages(selectedFolder.id)
    if (!error) onFolderDeleted()
    setFolderDeleteLoading(false)
  }

  const handleFolderMove = async (direction: 'up' | 'down') => {
    if (!selectedFolder || !canReorderFolder) return
    const swapIndex = direction === 'up' ? folderReorderIndex - 1 : folderReorderIndex + 1
    if (swapIndex < 0 || swapIndex >= reorderableFolders.length) return

    const current = reorderableFolders[folderReorderIndex]
    const neighbor = reorderableFolders[swapIndex]

    setFolderReorderLoading(true)
    const { error } = await swapFolderPositions(current, neighbor)
    if (!error) await onFolderRefresh()
    setFolderReorderLoading(false)
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
    <main className="relative flex flex-col h-full min-h-0 bg-brand-50/40">
      <div className="flex items-center px-5 h-12 bg-white border-b border-brand-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditingFolder && selectedFolder ? (
            <span className="text-sm font-medium text-brand-600">폴더 이름 수정</span>
          ) : (
            <>
              <h2 className="min-w-0 flex-1 font-semibold text-gray-700 text-sm tracking-wide uppercase truncate">
                {selectedFolder ? selectedFolder.name : '전체보기'}
                <span className="ml-2 text-xs font-normal text-gray-400">({filtered.length})</span>
              </h2>
              {canEditFolder && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <div className="flex flex-col items-center justify-center w-6 -my-0.5">
                    <button
                      onClick={() => handleFolderMove('up')}
                      disabled={!canReorderFolder || folderReorderIndex <= 0 || folderReorderLoading}
                      className="flex items-center justify-center w-6 h-4 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="폴더 위로"
                      aria-label="폴더 위로"
                    >
                      <ChevronUpIcon size={11} />
                    </button>
                    <button
                      onClick={() => handleFolderMove('down')}
                      disabled={!canReorderFolder || folderReorderIndex >= reorderableFolders.length - 1 || folderReorderLoading}
                      className="flex items-center justify-center w-6 h-4 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="폴더 아래로"
                      aria-label="폴더 아래로"
                    >
                      <ChevronDownIcon size={11} />
                    </button>
                  </div>
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

      {/* 추가 폼 — 스크롤 + 하단 버튼 고정 */}
      {isAdding ? (
        <div className="mx-4 mt-4 mb-4 flex-1 min-h-0 flex flex-col rounded-xl bg-white border border-brand-200 shadow-sm overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4">
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
              ref={addContentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용 (선택사항)"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none overflow-hidden min-h-[4.5rem]"
            />
            <ImageInsertButton
              textareaRef={addContentRef}
              value={content}
              onChange={setContent}
              disabled={addLoading}
            />
          </div>
          <div className="shrink-0 p-3 border-t border-gray-100 bg-white space-y-2">
            {addError && (
              <p className="text-xs text-red-500">{addError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={addLoading || !title.trim()}
                className="flex-1 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {addLoading ? '저장 중...' : '저장'}
              </button>
              <button
                type="button"
                onClick={resetAddForm}
                disabled={addLoading}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : (
      <PullToRefresh
        onRefresh={async () => {
          await Promise.resolve(onFolderRefresh())
        }}
      >
        <div className="px-4 py-4 pb-24">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg width="48" height="48" className="mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">노트가 없습니다</p>
            </div>
          ) : (
            <div className="notes-grid">
              {filtered.map((note, index) =>
                editState?.id === note.id ? (
                  /* 수정 폼 — 스크롤 + 하단 버튼 고정 */
                  <div
                    key={note.id}
                    className="bg-white rounded-xl border border-brand-300 shadow-sm overflow-hidden flex flex-col max-h-[min(85dvh,calc(100dvh-7rem))]"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4">
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
                        ref={editContentRef}
                        value={editState.content}
                        onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                        placeholder="내용 (선택사항)"
                        rows={5}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none overflow-hidden min-h-[7.5rem]"
                      />
                      <ImageInsertButton
                        textareaRef={editContentRef}
                        value={editState.content}
                        onChange={(next) => setEditState({ ...editState, content: next })}
                        disabled={editLoading}
                      />
                    </div>
                    <div className="shrink-0 p-3 border-t border-gray-100 bg-white space-y-2">
                      {editError && (
                        <p className="text-xs text-red-500">{editError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleEdit}
                          disabled={editLoading || !editState.title.trim()}
                          className="flex-1 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
                        >
                          {editLoading ? '저장 중...' : '저장'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditState(null); setEditError('') }}
                          disabled={editLoading}
                          className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 노트 보기 */
                  <div key={note.id} className="note-card border border-brand-200">
                    {note.title && (
                      <div className="note-card-title">
                        <p>{note.title}</p>
                      </div>
                    )}
                    <div className="note-card-body">
                      {note.content && <NoteContent text={note.content} />}
                      <LegacyNoteImages link={note.link} content={note.content ?? ''} />
                    </div>
                    <div className="note-card-actions">
                      {canReorder && (
                        <>
                          <button
                            onClick={() => handleMove(note.id, 'up')}
                            disabled={index <= 0 || reorderLoading === note.id}
                            className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                            title="위로"
                          >
                            <ChevronUpIcon size={12} />
                          </button>
                          <button
                            onClick={() => handleMove(note.id, 'down')}
                            disabled={index >= filtered.length - 1 || reorderLoading === note.id}
                            className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                            title="아래로"
                          >
                            <ChevronDownIcon size={12} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { startEdit(note); setIsAdding(false) }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-brand-600 hover:bg-white"
                        title="수정"
                      >
                        <EditIcon size={14} />
                      </button>
                      <button
                        onClick={() => requestDelete(note.id)}
                        disabled={deleteLoading === note.id}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-white disabled:opacity-50"
                        title="삭제"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </PullToRefresh>
      )}

      {!isAdding && (
        <button
          type="button"
          onClick={openAddForm}
          className="absolute bottom-5 right-5 z-20 flex items-center gap-1.5 px-4 py-3 rounded-full text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 shadow-lg active:scale-95 transition-all"
          aria-label="노트 추가"
        >
          <PlusIcon />
          <span>노트 추가</span>
        </button>
      )}

      {pendingDeleteId && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-note-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="delete-note-title" className="text-base font-semibold text-gray-900">
              노트를 삭제할까요?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              삭제하면 첨부 이미지 포함해 되돌릴 수 없습니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={Boolean(deleteLoading)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={Boolean(deleteLoading)}
                className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {deleteLoading ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
