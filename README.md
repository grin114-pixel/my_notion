# My Notion

Supabase 기반의 노트 모아보기 PWA입니다. `place_moa`(놀러가자) 앱과 동일한 2열 레이아웃(폴더 사이드바 + 노트 그리드) 구조를 따르며, 메인 컬러(파스텔 라벤더 `#9078EA`), 아이콘(🗒️), 헤더 타이틀만 바꾼 버전입니다.

## 시작하기

1. 의존성 설치

```bash
npm install
```

2. Supabase 테이블 생성

Supabase 프로젝트의 SQL Editor에서 `supabase/schema.sql` 내용을 실행하세요. `mynotion_folders`, `mynotion_notes` 테이블이 생성됩니다.

3. 환경변수 확인

`.env.local`에 다음 값이 채워져 있어야 합니다(기본값은 `place_moa`와 동일한 Supabase 프로젝트를 재사용하며, 다른 프로젝트를 쓰려면 값을 교체하세요):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인하세요.

## 앱 아이콘 (PWA)

`public/icon-192.png`, `public/icon-512.png` 두 파일이 홈 화면 아이콘/PWA 아이콘으로 사용됩니다(`public/manifest.json`, `app/layout.tsx` 참고). Notion 앱 아이콘과 비슷한 느낌(파스텔 라벤더 배경 + 흰색 3D 박스 "N" 마크)으로 생성한 이미지를 아래 경로에 복사해 두 파일명으로 저장해주세요:

```
C:\Users\이지연\.cursor\projects\c-Users-Desktop-my-app-notion\assets\app-icon-notion-style.png
```

PowerShell 예시:

```powershell
Copy-Item "C:\Users\이지연\.cursor\projects\c-Users-Desktop-my-app-notion\assets\app-icon-notion-style.png" "public\icon-192.png"
Copy-Item "C:\Users\이지연\.cursor\projects\c-Users-Desktop-my-app-notion\assets\app-icon-notion-style.png" "public\icon-512.png"
```

> 참고: 이 아이콘은 실제 Notion 앱 아이콘(3D 박스 + N 마크)의 디자인을 색상만 바꿔 매우 유사하게 재현한 것입니다. 개인용 앱이라면 문제없지만, 배포/공개할 계획이라면 상표권 이슈를 피하기 위해 더 차별화된 디자인으로 바꾸는 것을 권장합니다.

`/icon-preview` 페이지에서 홈 화면 아이콘 미리보기를 확인할 수 있습니다.

## 구조

- `app/page.tsx` — 헤더 + 2열 레이아웃(폴더 / 노트) 메인 화면
- `app/components/FolderColumn.tsx` — 좌측 폴더 목록 (추가/수정/삭제/순서 변경)
- `app/components/NoteColumn.tsx` — 우측 노트 그리드 (추가/수정/삭제/검색)
- `lib/supabase.ts` — Supabase 클라이언트 및 폴더/노트 데이터 함수
- `supabase/schema.sql` — DB 스키마 (테이블, RLS 정책)
- `public/manifest.json`, `public/sw.js` — PWA 매니페스트 및 서비스 워커
- `scripts/cleanup-default-folders.mjs` — 중복 생성된 "미분류" 폴더 정리 스크립트

## 배포

Vercel에 배포할 경우 `vercel.json`이 이미 포함되어 있습니다. 환경변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)를 Vercel 프로젝트 설정에도 등록하세요.
