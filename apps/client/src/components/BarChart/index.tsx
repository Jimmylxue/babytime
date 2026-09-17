/** 柱状图组件：屏幕渲染（带生长动画 + 点按选中），绘制逻辑在 painter.ts 与海报共用 */
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { paintBarChart, BarChartPoint } from './painter'
import './index.scss'

export type { BarChartPoint }

interface BarChartProps {
  canvasId: string
  points: BarChartPoint[]
  /** 单根柱子的最小槽位（px）：容器宽度够时平铺铺满，不够时按此宽度横向滚动 */
  minSlot?: number
  color?: string
  /** 高亮某根柱子；null 表示无选中 */
  highlightIndex?: number | null
  /** 点按某根柱子后回调；点在图表空白处回调 null */
  onSelectIndex?: (index: number | null) => void
}

const DURATION = 650
/** 横向位移超过这个距离（px）视为滚动，抬手时不触发选中 */
const SCROLL_THRESHOLD = 12
/** 与 painter 非海报模式的左右留白保持一致 */
const PAINT_PAD_X = 12

export default function BarChart({
  canvasId,
  points,
  minSlot = 40,
  color = '#FF8FA9',
  highlightIndex = null,
  onSelectIndex,
}: BarChartProps) {
  const pointKey = JSON.stringify(points)
  const [fixedWidth, setFixedWidth] = useState<number | null>(null)
  const [effWidth, setEffWidth] = useState<number | null>(null)
  const animRef = useRef<{ cancelled: boolean } | null>(null)
  const lastPointKeyRef = useRef('')
  const pendingAnimRef = useRef(false)
  const touchStartXRef = useRef(0)
  const scrolledRef = useRef(false)

  useEffect(() => {
    setFixedWidth(null)
    setEffWidth(null)
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select(`#bc-wrap-${canvasId}`)
        .boundingClientRect(rect => {
          const r = (Array.isArray(rect) ? rect[0] : rect) as {
            width: number
          } | null
          if (!r || !r.width) return
          if (points.length * minSlot <= r.width) {
            setEffWidth(r.width)
          } else {
            setFixedWidth(points.length * minSlot)
            setEffWidth(points.length * minSlot)
          }
        })
        .exec()
    }, 50)
    return () => clearTimeout(timer)
  }, [points.length, minSlot, canvasId])

  useEffect(() => {
    if (!effWidth) return
    // 用 pending 标记而不是当场判断：这个 effect 会因 highlightIndex 变化而重跑，
    // 重跑时会清掉上一次的定时器 —— 若当场判断，动画就被永久跳过（表现为柱子直接出现）
    if (lastPointKeyRef.current !== pointKey) {
      lastPointKeyRef.current = pointKey
      pendingAnimRef.current = true
    }
    const timer = setTimeout(() => {
      const animate = pendingAnimRef.current
      pendingAnimRef.current = false
      draw(animate)
    }, 40)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey, effWidth, color, highlightIndex])

  const draw = (animate: boolean) => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node || !points.length) return
        const { node, width, height } = res[0]
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2
        node.width = width * dpr
        node.height = height * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        paint(node, ctx, width, height, animate)
      })
  }

  const paint = (node, ctx, W: number, H: number, animate: boolean) => {
    const data = { points, color, highlightIndex }

    if (!animate) {
      // 生长动画进行中就不打断它（点选一般发生在动画结束后，这里只是兜底）
      if (animRef.current && !animRef.current.cancelled) return
      paintBarChart(ctx, { x: 0, y: 0, w: W, h: H }, data, 1)
      return
    }

    if (animRef.current) animRef.current.cancelled = true
    const token = { cancelled: false }
    animRef.current = token
    const start = Date.now()
    const step = () => {
      if (token.cancelled) return
      const t = Math.min(1, (Date.now() - start) / DURATION)
      paintBarChart(ctx, { x: 0, y: 0, w: W, h: H }, data, t)
      if (t < 1) {
        if (node.requestAnimationFrame) node.requestAnimationFrame(step)
        else setTimeout(step, 16)
      } else if (animRef.current === token) {
        // 播完了就解除「动画中」状态，后续的高亮重绘才能生效
        animRef.current = null
      }
    }
    step()
  }

  const handleTouchStart = (e: any) => {
    const touch = e?.touches?.[0]
    if (!touch) return
    touchStartXRef.current = touch.clientX
    scrolledRef.current = false
  }

  const handleTouchMove = (e: any) => {
    const touch = e?.touches?.[0]
    if (!touch) return
    if (Math.abs(touch.clientX - touchStartXRef.current) > SCROLL_THRESHOLD) {
      scrolledRef.current = true
    }
  }

  const handleTouchEnd = (e: any) => {
    if (!onSelectIndex || scrolledRef.current) return
    const touch = e?.changedTouches?.[0] || e?.touches?.[0]
    if (!touch || typeof touch.clientX !== 'number') return
    if (!effWidth || !points.length) return

    Taro.createSelectorQuery()
      .select(`#bc-wrap-${canvasId}`)
      .boundingClientRect(rect => {
        const r = (Array.isArray(rect) ? rect[0] : rect) as {
          left: number
        } | null
        if (!r) return
        const localX = touch.clientX - r.left
        // 柱子是等宽槽位分布，先按槽位定位到是哪一根
        const slotW = (effWidth - PAINT_PAD_X * 2) / points.length
        const index = Math.floor((localX - PAINT_PAD_X) / slotW)
        if (index < 0 || index >= points.length) {
          onSelectIndex(null)
          return
        }
        // 再判断是否真的点在柱子上：槽位宽约 40px 而柱子只有 12px，
        // 若按整个槽位命中，点到柱子两侧的空白也会改日期，误触率很高
        const centerX = PAINT_PAD_X + slotW * index + slotW / 2
        const tolerance = Math.min(14, slotW * 0.4)
        onSelectIndex(Math.abs(localX - centerX) <= tolerance ? index : null)
      })
      .exec()
  }

  return (
    <View
      id={`bc-wrap-${canvasId}`}
      className='bc-container'
      style={fixedWidth ? { width: `${fixedWidth}px` } : { width: '100%' }}
    >
      {effWidth != null && (
        <Canvas type='2d' id={canvasId} className='bc-canvas' />
      )}
      {/* 透明蒙层：Canvas 原生组件会吞掉触摸事件，盖一层 View 让手势冒泡给外层 ScrollView。
          点按选中也挂在这里，横向滚动（位移超阈值）时不触发。 */}
      <View
        className='bc-mask'
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </View>
  )
}
