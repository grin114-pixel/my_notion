import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const DEFAULT_NAME = '미분류'

const { data: folders, error } = await supabase
  .from('mynotion_folders')
  .select('*')
  .eq('name', DEFAULT_NAME)
  .order('created_at', { ascending: true })

if (error) {
  console.error('조회 실패:', error.message)
  process.exit(1)
}

if (!folders?.length) {
  console.log('미분류 폴더가 없습니다.')
  process.exit(0)
}

if (folders.length === 1) {
  console.log('미분류 폴더가 1개뿐입니다. 정리할 항목이 없습니다.')
  process.exit(0)
}

const keep = folders[0]
const duplicates = folders.slice(1)

console.log(`유지: ${keep.id} (생성: ${keep.created_at})`)
console.log(`삭제 대상: ${duplicates.length}개`)

for (const dup of duplicates) {
  const { data: notes } = await supabase
    .from('mynotion_notes')
    .select('id')
    .eq('folder_id', dup.id)

  if (notes?.length) {
    const { error: moveError } = await supabase
      .from('mynotion_notes')
      .update({ folder_id: keep.id })
      .eq('folder_id', dup.id)

    if (moveError) {
      console.error(`노트 이동 실패 (${dup.id}):`, moveError.message)
      process.exit(1)
    }
    console.log(`  ${dup.id}: 노트 ${notes.length}개 → 유지 폴더로 이동`)
  }

  const { error: deleteError } = await supabase
    .from('mynotion_folders')
    .delete()
    .eq('id', dup.id)

  if (deleteError) {
    console.error(`삭제 실패 (${dup.id}):`, deleteError.message)
    process.exit(1)
  }
  console.log(`  ${dup.id}: 삭제 완료`)
}

console.log(`\n완료! 미분류 폴더 1개만 남았습니다.`)
