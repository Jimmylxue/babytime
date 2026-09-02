/** WHO 成长曲线组件：屏幕渲染（带生长动画），绘制逻辑在 painter.ts 与海报共用 */
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { paintGrowthCurve, GrowthCurvePoint } from './painter'
import './index.scss'

export type { GrowthCurvePoint }

interface GrowthCurveChartProps {
  canvasId: string
  metric: 'height' | 'weight'
  gender: 'male' | 'female'
  babyName?: string
  points: GrowthCurvePoint[]
  color?: string
}

const DURATION = 700

export default function GrowthCurveChart({
  canvasId,
  metric,
  gender,
  babyName,
  points,
  color = '#FF8FA9',
}: GrowthCurveChartProps) {
  const pointKey = JSON.stringify(points) + metric + gender
  const animRef = useRef<{ cancelled: boolean } | null>(null)

  useEffect(() => {
    const timer = setTimeout(draw, 60)
    return () => clearTimeout(timer)
  }, [pointKey, color])

  const draw = () => {
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) return
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
      paintGrowthCurve(
        ctx,
        { x: 0, y: 0, w: W, h: H },
        { metric, gender, babyName, points, color, drawTitle: true },
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
    <View className='gc-container'>
      <Canvas type='2d' id={canvasId} className='gc-canvas' />
    </View>
  )
}
