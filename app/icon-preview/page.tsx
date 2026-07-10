import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: '바로가기 아이콘 미리보기 · My Notion',
}

export default function IconPreviewPage() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-50/60 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← 홈으로
        </Link>
        <h1 className="mt-4 text-xl font-bold text-gray-900">바로가기 추가 아이콘 미리보기</h1>
        <p className="mt-1 text-sm text-gray-500 flex items-center gap-2">
          헤더 아이콘과 동일한 이미지입니다.
          <Image
            src="/icon-192.png"
            alt=""
            width={22}
            height={22}
            className="rounded-[5px]"
          />
        </p>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm border border-brand-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">iOS / Android 홈 화면</h2>
          <div className="flex flex-wrap gap-8 justify-center items-end">
            <div className="flex flex-col items-center gap-2">
              <div className="w-[60px] h-[60px] rounded-[14px] overflow-hidden shadow-md ring-1 ring-black/5">
                <Image src="/icon-192.png" alt="" width={60} height={60} className="w-full h-full object-cover" priority />
              </div>
              <span className="text-xs text-gray-600 font-medium">My Notion</span>
              <span className="text-[10px] text-gray-400">60×60 (표시 크기)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-[80px] h-[80px] rounded-[18px] overflow-hidden shadow-lg ring-1 ring-black/5">
                <Image src="/icon-192.png" alt="" width={80} height={80} className="w-full h-full object-cover" priority />
              </div>
              <span className="text-xs text-gray-600 font-medium">My Notion</span>
              <span className="text-[10px] text-gray-400">큰 아이콘</span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm border border-brand-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">원본 크기</h2>
          <div className="flex flex-wrap gap-6 justify-center items-center">
            <div className="text-center">
              <Image
                src="/icon-192.png"
                alt="192×192"
                width={192}
                height={192}
                className="rounded-[22%] shadow-md"
              />
              <p className="mt-2 text-xs text-gray-500">192 × 192</p>
            </div>
            <div className="text-center">
              <Image
                src="/icon-512.png"
                alt="512×512"
                width={128}
                height={128}
                className="rounded-[22%] shadow-md"
              />
              <p className="mt-2 text-xs text-gray-500">512 × 512 (축소 표시)</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-brand-50 p-4 border border-brand-100">
          <p className="text-xs text-brand-800 leading-relaxed">
            <strong>추가 방법:</strong> Safari/Chrome에서 공유 → &quot;홈 화면에 추가&quot; 또는 &quot;앱 설치&quot;를 선택하세요.
            테마 색상은 <span className="font-mono">#18181B</span> 입니다.
          </p>
        </section>
      </div>
    </div>
  )
}
