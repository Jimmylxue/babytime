/** 柱状图组件：屏幕渲染（带生长动画），绘制逻辑在 painter.ts 与海报共用 */
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
}

const DURATION = 650

export default function BarChart({
  canvasId,
  points,
  minSlot = 40,
  color = '#FF8FA9',
}: BarChartProps) {
  const pointKey = JSON.stringify(points)
  const [fixedWidth, setFixedWidth] = useState<number | null>(null)
  const [effWidth, setEffWidth] = useState<number | null>(null)
  const animRef = useRef<{ cancelled: boolean } | null>(null)

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
    const timer = setTimeout(draw, 40)
    return () => clearTimeout(timer)
  }, [pointKey, effWidth, color])

  const draw = () => {
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
        runAnimation(node, ctx, width, height)
      })
  }

  const runAnimation = (node, ctx, W: number, H: number) => {
    if (animRef.current) animRef.current.cancelled = true
    const token = { cancelled: false }
    animRef.current = token
    const start = Date.now()
    const step = () => {
      if (token.cancelled) return
      const t = Math.min(1, (Date.now() - start) / DURATION)
      paintBarChart(ctx, { x: 0, y: 0, w: W, h: H }, { points, color }, t)
      if (t < 1) {
        if (node.requestAnimationFrame) node.requestAnimationFrame(step)
        else setTimeout(step, 16)
      }
    }
    step()
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
      {/* 透明蒙层：Canvas 原生组件会吞掉触摸事件，盖一层 View 让手势冒泡给外层 ScrollView */}
      <View className='bc-mask' />
    </View>
  )
}
