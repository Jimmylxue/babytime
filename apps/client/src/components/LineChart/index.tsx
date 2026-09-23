/** 折线图组件：屏幕渲染（带生长动画 + 点按选中），绘制逻辑在 painter.ts 与海报共用 */
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { paintLineChart, LineChartPoint, LINE_PAD } from './painter'
import './index.scss'

export type { LineChartPoint }

interface LineChartProps {
  canvasId: string
  points: LineChartPoint[]
  unit: string
  minSpan?: number
  color?: string
  /** 数值气泡文案；不传则保留一位小数 */
  formatValue?: (value: number) => string
  /** 高亮某个数据点；null 表示无选中 */
  highlightIndex?: number | null
  /** 点按某个数据点后回调；点在图表空白处回调 null */
  onSelectIndex?: (index: number | null) => void
}

const DURATION = 650

export default function LineChart({
  canvasId,
  points,
  unit,
  minSpan = 1,
  color = '#FF8FA9',
  formatValue,
  highlightIndex = null,
  onSelectIndex,
}: LineChartProps) {
  const pointKey = JSON.stringify(points)
  const animRef = useRef<{ cancelled: boolean } | null>(null)
  const lastPointKeyRef = useRef('')
  const pendingAnimRef = useRef(false)

  useEffect(() => {
    // 与 BarChart 同理：用 pending 标记，effect 因 highlightIndex 重跑时不会跳过生长动画
    if (lastPointKeyRef.current !== pointKey) {
      lastPointKeyRef.current = pointKey
      pendingAnimRef.current = true
    }
    const timer = setTimeout(() => {
      const animate = pendingAnimRef.current
      pendingAnimRef.current = false
      draw(animate)
    }, 60)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey, unit, minSpan, color, formatValue, highlightIndex])

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
    const data = { points, unit, minSpan, color, formatValue, highlightIndex }

    if (!animate) {
      // 生长动画进行中就不打断它（点选一般发生在动画结束后，这里只是兜底）
      if (animRef.current && !animRef.current.cancelled) return
      paintLineChart(ctx, { x: 0, y: 0, w: W, h: H }, data, 1)
      return
    }

    if (animRef.current) animRef.current.cancelled = true
    const token = { cancelled: false }
    animRef.current = token
    const start = Date.now()
    const step = () => {
      if (token.cancelled) return
      const t = Math.min(1, (Date.now() - start) / DURATION)
      paintLineChart(ctx, { x: 0, y: 0, w: W, h: H }, data, t)
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

  const handleTouchEnd = (e: any) => {
    if (!onSelectIndex || points.length === 0) return
    const touch = e?.changedTouches?.[0] || e?.touches?.[0]
    if (!touch || typeof touch.clientX !== 'number') return

    Taro.createSelectorQuery()
      .select(`#lc-wrap-${canvasId}`)
      .boundingClientRect(rect => {
        const r = (Array.isArray(rect) ? rect[0] : rect) as {
          left: number
          width: number
        } | null
        if (!r || !r.width) return
        const localX = touch.clientX - r.left
        const plotLeft = LINE_PAD.left
        const plotW = r.width - LINE_PAD.left - LINE_PAD.right
        if (plotW <= 0) return
        // 折线图的数据点是等距分布的，按比例反推最近的一个
        const ratio = (localX - plotLeft) / plotW
        const index = Math.round(ratio * (points.length - 1))
        onSelectIndex(index >= 0 && index < points.length ? index : null)
      })
      .exec()
  }

  return (
    <View id={`lc-wrap-${canvasId}`} className='lc-container'>
      <Canvas type='2d' id={canvasId} className='lc-canvas' />
      {/* 透明蒙层接管点按（Canvas 原生组件会吞掉触摸事件）；不阻止冒泡，不影响页面滚动 */}
      <View className='lc-mask' onTouchEnd={handleTouchEnd} />
    </View>
  )
}
