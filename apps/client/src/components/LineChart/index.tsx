/** 折线图组件：屏幕渲染（带生长动画），绘制逻辑在 painter.ts 与海报共用 */
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { paintLineChart, LineChartPoint } from './painter'
import './index.scss'

export type { LineChartPoint }

interface LineChartProps {
  canvasId: string
  points: LineChartPoint[]
  unit: string
  minSpan?: number
  color?: string
}

const DURATION = 650

export default function LineChart({
  canvasId,
  points,
  unit,
  minSpan = 1,
  color = '#FF8FA9',
}: LineChartProps) {
  const pointKey = JSON.stringify(points)
  const animRef = useRef<{ cancelled: boolean } | null>(null)

  useEffect(() => {
    const timer = setTimeout(draw, 60)
    return () => clearTimeout(timer)
  }, [pointKey, unit, minSpan, color])

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
      paintLineChart(
        ctx,
        { x: 0, y: 0, w: W, h: H },
        { points, unit, minSpan, color },
        t,
      )
      if (t < 1) {
        if (node.requestAnimationFrame) node.requestAnimationFrame(step)
        else setTimeout(step, 16)
      }
    }
    step()
  }

  return (
    <View className='lc-container'>
      <Canvas type='2d' id={canvasId} className='lc-canvas' />
    </View>
  )
}
