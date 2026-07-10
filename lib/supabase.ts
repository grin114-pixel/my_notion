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
