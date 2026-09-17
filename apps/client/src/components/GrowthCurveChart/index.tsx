/** WHO 成长曲线组件：屏幕渲染（生长动画 + 点按查看 + 双指缩放），绘制逻辑在 painter.ts 与海报共用 */
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  paintGrowthCurve,
  filterCurvePoints,
  getCurveLayout,
  clampCurveView,
  GrowthCurvePoint,
  CurveView,
} from './painter'
import './index.scss'

export type { GrowthCurvePoint, CurveView }

interface GrowthCurveChartProps {
  canvasId: string
  metric: 'height' | 'weight'
  gender: 'male' | 'female'
  babyName?: string
  points: GrowthCurvePoint[]
  color?: string
  /** 是否在画布内绘制标题与「WHO标准 · 月龄范围」。页面已有外层标题时传 false，避免重复 */
  showTitle?: boolean
  /** 横轴视窗（受控）。不传表示展示完整的 0~36 月龄 */
  view?: CurveView
  /** 双指缩放后回调新视窗 */
  onViewChange?: (view: CurveView) => void
  /** 点按曲线上的测量点后回调；点在空白处回调 null */
  onSelectPoint?: (point: GrowthCurvePoint | null) => void
}

const DURATION = 700
/** 点按命中容差（px）：离最近的点超过这个距离，就当作点在空白处 */
const HIT_TOLERANCE = 36
/** 单指位移超过这个距离（px）就判定为拖动平移，而不是点选 */
const PAN_THRESHOLD = 8

const touchDistance = (a: any, b: any) => {
  const dx = (a?.clientX || 0) - (b?.clientX || 0)
  const dy = (a?.clientY || 0) - (b?.clientY || 0)
  return Math.sqrt(dx * dx + dy * dy)
}

export default function GrowthCurveChart({
  canvasId,
  metric,
  gender,
  babyName,
  points,
  color = '#FF8FA9',
  showTitle = true,
  view,
  onViewChange,
  onSelectPoint,
}: GrowthCurveChartProps) {
  const pointKey = JSON.stringify(points) + metric + gender
  const viewKey = view ? `${view.xMin.toFixed(3)}|${view.xMax.toFixed(3)}` : 'full'

  const animRef = useRef<{ cancelled: boolean } | null>(null)
  const canvasRef = useRef<{ node: any; ctx: any } | null>(null)
  const drawTokenRef = useRef(0)
  const lastPointKeyRef = useRef('')
  const pinchRef = useRef<{
    startDist: number
    startCenterX: number
    startView: CurveView
  } | null>(null)
  const panRef = useRef<{
    startX: number
    startView: CurveView
    moved: boolean
  } | null>(null)
  const didPinchRef = useRef(false)
  const touchCountRef = useRef(0)

  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const sortedPoints = useMemo(() => filterCurvePoints(points), [pointKey])

  // 命中检测与绘制共用同一套布局，避免点和手指对不上
  const layout = useMemo(
    () =>
      getCurveLayout(
        canvasSize.w,
        canvasSize.h,
        metric,
        gender,
        showTitle,
        view,
        sortedPoints,
      ),
    [canvasSize.w, canvasSize.h, metric, gender, showTitle, viewKey, sortedPoints],
  )

  const activePoint =
    activeIndex != null ? sortedPoints[activeIndex] || null : null

  // 指标或数据切换后，原来的选中点已无意义，清掉（缩放不动选中态）
  useEffect(() => {
    setActiveIndex(null)
    onSelectPoint?.(null)
    // 只在数据/指标变化时重置，onSelectPoint 每次渲染都是新函数，不能进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey])

  useEffect(() => {
    // 数据/指标变了才播生长动画；单纯缩放时立即重绘，否则每捏一下就重播一遍很卡
    const animate = lastPointKeyRef.current !== pointKey
    lastPointKeyRef.current = pointKey
    const timer = setTimeout(() => draw(animate), animate ? 60 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey, color, showTitle, viewKey])

  const draw = (animate: boolean) => {
    // 尺寸已知时直接复用缓存的 node/ctx 重绘。
    // 缩放是高频操作，每次都走一遍异步 selectorQuery 会明显发涩。
    const cached = canvasRef.current
    if (cached && canvasSize.w > 0 && canvasSize.h > 0) {
      paint(cached.node, cached.ctx, canvasSize.w, canvasSize.h, animate)
      return
    }

    const token = ++drawTokenRef.current
    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec(res => {
        // 连续缩放时会有多个查询在飞，只认最后一个
        if (token !== drawTokenRef.current) return
        if (!res || !res[0] || !res[0].node) return
        const { node, width, height } = res[0]
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2
        node.width = width * dpr
        node.height = height * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        canvasRef.current = { node, ctx }
        setCanvasSize(prev =>
          prev.w === width && prev.h === height ? prev : { w: width, h: height },
        )
        paint(node, ctx, width, height, animate)
      })
  }

  const paint = (node, ctx, W: number, H: number, animate: boolean) => {
    if (animRef.current) animRef.current.cancelled = true
    const data = { metric, gender, babyName, points, color, drawTitle: showTitle, view }

    if (!animate) {
      paintGrowthCurve(ctx, { x: 0, y: 0, w: W, h: H }, data, 1)
      return
    }

    const token = { cancelled: false }
    animRef.current = token
    const start = Date.now()
    const step = () => {
      if (token.cancelled) return
      const t = Math.min(1, (Date.now() - start) / DURATION)
      paintGrowthCurve(ctx, { x: 0, y: 0, w: W, h: H }, data, t)
      if (t < 1) {
        if (node.requestAnimationFrame) node.requestAnimationFrame(step)
        else setTimeout(step, 16)
      }
    }
    step()
  }

  const handleTouchStart = (e: any) => {
    const touches = e?.touches || []
    touchCountRef.current = touches.length
    const startView = view || { xMin: 0, xMax: 36 }

    if (touches.length === 2 && onViewChange) {
      didPinchRef.current = false
      panRef.current = null
      pinchRef.current = {
        startDist: touchDistance(touches[0], touches[1]),
        startCenterX: (touches[0].clientX + touches[1].clientX) / 2,
        startView,
      }
      return
    }

    pinchRef.current = null
    panRef.current =
      touches.length === 1 && onViewChange
        ? { startX: touches[0].clientX, startView, moved: false }
        : null
  }

  const handleTouchMove = (e: any) => {
    const touches = e?.touches || []
    if (!onViewChange) return
    const plotW = layout.plotW
    if (plotW <= 0) return

    // 双指：缩放，同时跟随两指中心平移
    const base = pinchRef.current
    if (touches.length === 2 && base) {
      const dist = touchDistance(touches[0], touches[1])
      if (!base.startDist || dist <= 0) return
      const baseSpan = base.startView.xMax - base.startView.xMin
      const span = (baseSpan * base.startDist) / dist
      const centerX = (touches[0].clientX + touches[1].clientX) / 2
      // 两指整体右移 → 视窗左移（内容跟着手指走）
      const centerShift = ((base.startCenterX - centerX) * baseSpan) / plotW
      const center =
        (base.startView.xMin + base.startView.xMax) / 2 + centerShift
      const next = clampCurveView(center - span / 2, center + span / 2)

      didPinchRef.current = true
      onViewChange(next)
      return
    }

    // 单指：拖动平移。位移没到阈值前不生效，把这一段留给点选
    const pan = panRef.current
    if (touches.length === 1 && pan) {
      const dx = touches[0].clientX - pan.startX
      if (!pan.moved) {
        if (Math.abs(dx) < PAN_THRESHOLD) return
        pan.moved = true
      }
      const span = pan.startView.xMax - pan.startView.xMin
      const shift = (-dx * span) / plotW
      onViewChange(
        clampCurveView(
          pan.startView.xMin + shift,
          pan.startView.xMax + shift,
        ),
      )
    }
  }

  const handleTouchEnd = (e: any) => {
    const wasPinch = didPinchRef.current
    const wasPan = Boolean(panRef.current?.moved)
    const touchCount = touchCountRef.current
    pinchRef.current = null
    panRef.current = null
    didPinchRef.current = false
    touchCountRef.current = 0

    // 刚做过缩放或拖动，抬手时不要再触发选中
    if (wasPinch || wasPan || touchCount !== 1) return
    if (!onSelectPoint) return

    const touch = e?.changedTouches?.[0] || e?.touches?.[0]
    if (!touch || typeof touch.clientX !== 'number') return
    if (!canvasSize.w || sortedPoints.length === 0) return

    Taro.createSelectorQuery()
      .select(`#${canvasId}`)
      .boundingClientRect()
      .exec(res => {
        const rect = res?.[0]
        if (!rect) return
        const localX = touch.clientX - rect.left

        let best = -1
        let bestDist = Infinity
        sortedPoints.forEach((p, i) => {
          const d = Math.abs(layout.toX(p.ageMonths) - localX)
          if (d < bestDist) {
            bestDist = d
            best = i
          }
        })

        const picked = bestDist <= HIT_TOLERANCE ? best : -1
        setActiveIndex(picked >= 0 ? picked : null)
        onSelectPoint(picked >= 0 ? sortedPoints[picked] : null)
      })
  }

  // 选中点用绝对定位的 DOM 圆环覆盖，避免为了高亮重画画布（会打断生长动画）
  const markerStyle =
    activePoint &&
    canvasSize.w > 0 &&
    canvasSize.h > 0 &&
    activePoint.ageMonths >= layout.xMin &&
    activePoint.ageMonths <= layout.xMax
      ? {
          left: `${(layout.toX(activePoint.ageMonths) / canvasSize.w) * 100}%`,
          top: `${(layout.toY(activePoint.value) / canvasSize.h) * 100}%`,
        }
      : null

  return (
    <View className='gc-container'>
      <Canvas type='2d' id={canvasId} className='gc-canvas' />
      {/* 蒙层统一接管手势：双指缩放要挡住页面滚动，单指点击用来选中数据点 */}
      <View
        className='gc-gesture'
        catchMove
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {markerStyle && <View className='gc-marker' style={markerStyle} />}
    </View>
  )
}
