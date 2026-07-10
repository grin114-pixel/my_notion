import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

export const TABLES = {
  folders: 'mynotion_folders',
  notes: 'mynotion_notes',
} as const

export const DEFAULT_FOLDER_NAME = '미분류'

let folderSortOrderSupported: boolean | null = null

export async function detectFolderSortOrderSupport(): Promise<boolean> {
  if (folderSortOrderSupported !== null) return folderSortOrderSupported
  const { error } = await supabase.from(TABLES.folders).select('sort_order').limit(1)
  folderSortOrderSupported = !error
  return folderSortOrderSupported
}

export function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => {
    const aDefault = a.name === DEFAULT_FOLDER_NAME
    const bDefault = b.name === DEFAULT_FOLDER_NAME
    if (aDefault !== bDefault) return aDefault ? 1 : -1
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export async function ensureFolderSortOrders(folders: Folder[]): Promise<void> {
  if (folders.length === 0) return
  if (!(await detectFolderSortOrderSupport())) return

  const regular = folders.filter((f) => f.name !== DEFAULT_FOLDER_NAME)
  const defaultFolder = folders.find((f) => f.name === DEFAULT_FOLDER_NAME)
  const orders = regular.map((f) => f.sort_order ?? 0)
  const uniqueOrders = new Set(orders)
  const needsInit = orders.every((o) => o === 0) || uniqueOrders.size !== orders.length

  if (!needsInit) return

  const sorted = [...regular].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  await Promise.all([
    ...sorted.map((folder, index) =>
      supabase.from(TABLES.folders).update({ sort_order: index }).eq('id', folder.id)
    ),
    ...(defaultFolder
      ? [supabase.from(TABLES.folders).update({ sort_order: 999999 }).eq('id', defaultFolder.id)]
      : []),
  ])
}

export async function swapFolderPositions(
  current: Folder,
  neighbor: Folder
): Promise<{ error?: string }> {
  const sortOrderSupported = await detectFolderSortOrderSupport()

  if (sortOrderSupported) {
    const currentOrder = current.sort_order ?? 0
    const neighborOrder = neighbor.sort_order ?? 0
    const [res1, res2] = await Promise.all([
      supabase.from(TABLES.folders).update({ sort_order: neighborOrder }).eq('id', current.id),
      supabase.from(TABLES.folders).update({ sort_order: currentOrder }).eq('id', neighbor.id),
    ])
    if (res1.error || res2.error) {
      return { error: res1.error?.message || res2.error?.message || '순서 변경 실패' }
    }
    return {}
  }

  const currentTime = new Date(current.created_at).getTime()
  const neighborTime = new Date(neighbor.created_at).getTime()
  const swappedNeighborTime =
    currentTime === neighborTime
      ? new Date(neighborTime - 1).toISOString()
      : neighbor.created_at

  const [res1, res2] = await Promise.all([
    supabase.from(TABLES.folders).update({ created_at: swappedNeighborTime }).eq('id', current.id),
    supabase.from(TABLES.folders).update({ created_at: current.created_at }).eq('id', neighbor.id),
  ])
  if (res1.error || res2.error) {
    return { error: res1.error?.message || res2.error?.message || '순서 변경 실패' }
  }
  return {}
}

export async function insertFolder(name: string, sortOrder?: number): Promise<{ error?: string }> {
  const sortOrderSupported = await detectFolderSortOrderSupport()
  const { error } =
    sortOrderSupported && sortOrder !== undefined
      ? await supabase.from(TABLES.folders).insert({ name, sort_order: sortOrder })
      : await supabase.from(TABLES.folders).insert({ name })
  if (error) return { error: error.message }
  return {}
}

export async function ensureDefaultFolder(): Promise<Folder | null> {
  const { data: existing } = await supabase
    .from(TABLES.folders)
    .select('*')
    .eq('name', DEFAULT_FOLDER_NAME)
    .maybeSingle()
  if (existing) return existing

  const { data: created } = await supabase
    .from(TABLES.folders)
    .insert({ name: DEFAULT_FOLDER_NAME })
    .select()
    .single()
  return created
}

export type Folder = {
  id: string
  name: string
  sort_order: number | null
  created_at: string
}

export type Note = {
  id: string
  folder_id: string
  title: string | null
  content: string
  link: string | null
  sort_order: number | null
  created_at: string
}

let noteSortOrderSupported: boolean | null = null

export async function detectNoteSortOrderSupport(): Promise<boolean> {
  if (noteSortOrderSupported !== null) return noteSortOrderSupported
  const { error } = await supabase.from(TABLES.notes).select('sort_order').limit(1)
  noteSortOrderSupported = !error
  return noteSortOrderSupported
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export async function ensureNoteSortOrders(notes: Note[]): Promise<void> {
  if (notes.length === 0) return
  if (!(await detectNoteSortOrderSupport())) return

  const orders = notes.map((n) => n.sort_order ?? 0)
  const uniqueOrders = new Set(orders)
  const needsInit = orders.every((o) => o === 0) || uniqueOrders.size !== orders.length
  if (!needsInit) return

  // 기존 데이터는 최신순(created_at desc)을 유지한 채 sort_order 부여
  const sorted = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  await Promise.all(
    sorted.map((note, index) =>
      supabase.from(TABLES.notes).update({ sort_order: index }).eq('id', note.id)
    )
  )
}

export async function swapNotePositions(
  current: Note,
  neighbor: Note
): Promise<{ error?: string }> {
  const sortOrderSupported = await detectNoteSortOrderSupport()

  if (sortOrderSupported) {
    const currentOrder = current.sort_order ?? 0
    const neighborOrder = neighbor.sort_order ?? 0
    const [res1, res2] = await Promise.all([
      supabase.from(TABLES.notes).update({ sort_order: neighborOrder }).eq('id', current.id),
      supabase.from(TABLES.notes).update({ sort_order: currentOrder }).eq('id', neighbor.id),
    ])
    if (res1.error || res2.error) {
      return { error: res1.error?.message || res2.error?.message || '순서 변경 실패' }
    }
    return {}
  }

  const currentTime = new Date(current.created_at).getTime()
  const neighborTime = new Date(neighbor.created_at).getTime()
  const swappedNeighborTime =
    currentTime === neighborTime
      ? new Date(neighborTime - 1).toISOString()
      : neighbor.created_at

  const [res1, res2] = await Promise.all([
    supabase.from(TABLES.notes).update({ created_at: swappedNeighborTime }).eq('id', current.id),
    supabase.from(TABLES.notes).update({ created_at: current.created_at }).eq('id', neighbor.id),
  ])
  if (res1.error || res2.error) {
    return { error: res1.error?.message || res2.error?.message || '순서 변경 실패' }
  }
  return {}
}

export async function getNextNoteSortOrder(folderId?: string): Promise<number> {
  if (!(await detectNoteSortOrderSupport())) return 0
  let query = supabase.from(TABLES.notes).select('sort_order')
  if (folderId) query = query.eq('folder_id', folderId)
  const { data } = await query
  if (!data?.length) return 0
  return data.reduce((max, n) => Math.max(max, n.sort_order ?? 0), -1) + 1
}

export const NOTE_IMAGE_BUCKET = 'note-images'

const MAX_IMAGE_EDGE = 640
const JPEG_QUALITY = 0.35
const MAX_DATA_URL_BYTES = 100_000
const MAX_LINK_PAYLOAD_CHARS = 350_000

async function compressImageFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('이미지 압축 실패')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 압축 실패'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지 읽기 실패'))
    reader.readAsDataURL(blob)
  })
}

export function isNoteImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith('data:image/')) return true
  if (url.includes(`/storage/v1/object/public/${NOTE_IMAGE_BUCKET}/`)) return true
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url)
}

/** Parse note.link into image URL list (supports JSON array or legacy single URL). */
export function parseNoteImages(link: string | null | undefined): string[] {
  if (!link) return []
  const trimmed = link.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      }
    } catch {
      // fall through to single-url handling
    }
  }
  return [trimmed]
}

export function serializeNoteImages(urls: string[]): string | null {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  if (cleaned.length === 1) return cleaned[0]
  return JSON.stringify(cleaned)
}

export function validateNoteImagePayload(urls: string[]): string | null {
  const link = serializeNoteImages(urls)
  if (!link) return null
  if (link.length > MAX_LINK_PAYLOAD_CHARS) {
    return '이미지 데이터가 너무 큽니다. 장수를 줄이거나 Supabase Storage 버킷(note-images)을 설정한 뒤 다시 첨부해주세요.'
  }
  const dataUrlCount = urls.filter((url) => url.startsWith('data:image/')).length
  if (dataUrlCount > 1) {
    return '여러 이미지는 Storage 업로드가 필요합니다. Supabase에서 note-images 버킷을 설정한 뒤 다시 첨부해주세요.'
  }
  return null
}

/** Collect image URLs from inline markdown content and legacy link field. */
export function collectNoteImageUrls(note: Pick<Note, 'content' | 'link'>): string[] {
  const fromContent: string[] = []
  const imageMd = /!\[([^\]]*)\]\(([^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = imageMd.exec(note.content ?? '')) !== null) {
    fromContent.push(match[2])
  }
  return [...fromContent, ...parseNoteImages(note.link)]
}

export function getNoteImageStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${NOTE_IMAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0] ?? '')
  return path || null
}

/** Removes uploaded note images from Supabase Storage. Data URLs are ignored. */
export async function deleteNoteImagesFromStorage(urls: string[]): Promise<void> {
  const paths = [...new Set(
    urls
      .map(getNoteImageStoragePath)
      .filter((path): path is string => Boolean(path))
  )]
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(NOTE_IMAGE_BUCKET).remove(paths)
  if (error) {
    console.error('노트 이미지 Storage 삭제 오류:', error)
  }
}

export async function deleteNoteWithImages(note: Pick<Note, 'id' | 'link' | 'content'>): Promise<{ error?: string }> {
  await deleteNoteImagesFromStorage(collectNoteImageUrls(note))
  const { error } = await supabase.from(TABLES.notes).delete().eq('id', note.id)
  if (error) return { error: error.message }
  return {}
}

export async function deleteFolderWithNoteImages(folderId: string): Promise<{ error?: string }> {
  const { data: notes, error: fetchError } = await supabase
    .from(TABLES.notes)
    .select('id, link, content')
    .eq('folder_id', folderId)

  if (fetchError) return { error: fetchError.message }

  const urls = (notes ?? []).flatMap((note) => collectNoteImageUrls(note))
  await deleteNoteImagesFromStorage(urls)

  const { error } = await supabase.from(TABLES.folders).delete().eq('id', folderId)
  if (error) return { error: error.message }
  return {}
}

/** Compresses and uploads a note image. Falls back to a data URL if Storage is unavailable. */
export async function uploadNoteImage(file: File): Promise<{ url?: string; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { error: '이미지 파일만 첨부할 수 있습니다.' }
  }

  try {
    const compressed = await compressImageFile(file)
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error } = await supabase.storage.from(NOTE_IMAGE_BUCKET).upload(path, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    })

    if (!error) {
      const { data } = supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(path)
      return { url: data.publicUrl }
    }

    if (compressed.size > MAX_DATA_URL_BYTES) {
      return {
        error: '이미지가 너무 큽니다. 더 작은 이미지를 선택하거나 Supabase Storage 버킷(note-images)을 설정하세요.',
      }
    }

    const dataUrl = await blobToDataUrl(compressed)
    return { url: dataUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '이미지 업로드 실패' }
  }
}
