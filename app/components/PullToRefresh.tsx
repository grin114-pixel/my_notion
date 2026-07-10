'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onRefresh: () => void | Promise<void>
  className?: string
}

const THRESHOLD = 72

export default function PullToRefresh({ children, onRefresh, className = '' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const distanceRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const setDistance = useCallback((value: number) => {
    distanceRef.current = value
    setPullDistance(value)
  }, [])

  const reset = useCallback(() => {
    pulling.current = false
    setDistance(0)
  }, [setDistance])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return
      if (el.scrollTop > 0) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return
      if (el.scrollTop > 0) {
        reset()
        return
      }
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        setDistance(0)
        return
      }
      const distance = Math.min(delta * 0.45, 120)
      setDistance(distance)
      if (distance > 8) e.preventDefault()
    }

    const onTouchEnd = async () => {
      if (!pulling.current || refreshing) {
        reset()
        return
      }
      const shouldRefresh = distanceRef.current >= THRESHOLD
      pulling.current = false
      if (!shouldRefresh) {
        setDistance(0)
        return
      }
      setRefreshing(true)
      setDistance(THRESHOLD)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setDistance(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', reset)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', reset)
    }
  }, [onRefresh, refreshing, reset, setDistance])

  const indicatorHeight = refreshing ? THRESHOLD : pullDistance
  const ready = pullDistance >= THRESHOLD || refreshing

  return (
    <div className={`relative flex-1 min-h-0 flex flex-col ${className}`}>
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center overflow-hidden text-xs text-gray-500"
        style={{ height: indicatorHeight }}
        aria-hidden={pullDistance === 0 && !refreshing}
      >
        {(pullDistance > 0 || refreshing) && (
          <span className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-sm border border-gray-200">
            <span
              className={`inline-block h-4 w-4 rounded-full border-2 border-gray-300 border-t-brand-500 ${
                refreshing || ready ? 'animate-spin' : ''
              }`}
              style={
                !refreshing && !ready
                  ? { transform: `rotate(${pullDistance * 2.5}deg)` }
                  : undefined
              }
            />
            {refreshing ? '새로고침 중...' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{
          paddingTop: indicatorHeight > 0 ? indicatorHeight : undefined,
          transition: pulling.current ? undefined : 'padding-top 150ms ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
