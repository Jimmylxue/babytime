import { View, Text } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'

export type FeedSide = 'left' | 'right'

export interface FeedingTimer {
	running: boolean
	finished: boolean
	side: FeedSide
	elapsedMs: number
	sideElapsedMs: Record<FeedSide, number>
	start: () => void
	pause: () => void
	resume: () => void
	switchSide: (side: FeedSide) => void
	finish: () => void
	reset: () => void
	/** 当前累计分钟数（不足 1 秒返回 null），保存时用来兜底填时长 */
	runningMinutes: () => number | null
}

interface UseFeedingTimerOptions {
	onStart: () => void
	onFinish: (minutes: number) => void
	onReset: () => void
}

export const formatClock = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000))
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60
	const pad = (n: number) => String(n).padStart(2, '0')
	return hours > 0
		? `${hours}:${pad(minutes)}:${pad(seconds)}`
		: `${pad(minutes)}:${pad(seconds)}`
}

// 计时全部基于时间戳：退后台时 setInterval 会停，回前台第一帧按真实时间校正
export function useFeedingTimer({
	onStart,
	onFinish,
	onReset,
}: UseFeedingTimerOptions): FeedingTimer {
	const accumRef = useRef(0)
	const sideAccumRef = useRef<Record<FeedSide, number>>({ left: 0, right: 0 })
	const runStartRef = useRef<number | null>(null)
	const sideRef = useRef<FeedSide>('left')
	const [running, setRunning] = useState(false)
	const [finished, setFinished] = useState(false)
	const [side, setSide] = useState<FeedSide>('left')
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (!running) return
		const timer = setInterval(() => setNow(Date.now()), 500)
		return () => clearInterval(timer)
	}, [running])

	const commitRunning = () => {
		const startedAt = runStartRef.current
		if (startedAt == null) return
		const elapsed = Math.max(0, Date.now() - startedAt)
		accumRef.current += elapsed
		sideAccumRef.current[sideRef.current] += elapsed
		runStartRef.current = null
	}

	const liveElapsed =
		runStartRef.current == null ? 0 : Math.max(0, now - runStartRef.current)
	const elapsedMs = accumRef.current + liveElapsed
	const sideElapsedMs: Record<FeedSide, number> = {
		left:
			sideAccumRef.current.left +
			(sideRef.current === 'left' ? liveElapsed : 0),
		right:
			sideAccumRef.current.right +
			(sideRef.current === 'right' ? liveElapsed : 0),
	}

	const start = () => {
		if (runStartRef.current != null) return
		runStartRef.current = Date.now()
		setNow(Date.now())
		setFinished(false)
		setRunning(true)
		onStart()
	}

	const pause = () => {
		if (runStartRef.current == null) return
		commitRunning()
		setNow(Date.now())
		setRunning(false)
	}

	const resume = () => {
		if (runStartRef.current != null || accumRef.current <= 0) return
		runStartRef.current = Date.now()
		setNow(Date.now())
		setRunning(true)
	}

	const switchSide = (next: FeedSide) => {
		if (next === sideRef.current || finished) return
		// 切换时把当前侧的这一段结算掉，总时长连续不断
		if (runStartRef.current != null) {
			const nowMs = Date.now()
			const elapsed = Math.max(0, nowMs - runStartRef.current)
			accumRef.current += elapsed
			sideAccumRef.current[sideRef.current] += elapsed
			runStartRef.current = nowMs
			setNow(nowMs)
		}
		sideRef.current = next
		setSide(next)
	}

	const finish = () => {
		if (runStartRef.current != null) commitRunning()
		setRunning(false)
		setNow(Date.now())
		const minutes = Math.max(1, Math.round(accumRef.current / 60000))
		setFinished(true)
		onFinish(minutes)
	}

	const reset = () => {
		accumRef.current = 0
		sideAccumRef.current = { left: 0, right: 0 }
		runStartRef.current = null
		sideRef.current = 'left'
		setSide('left')
		setRunning(false)
		setFinished(false)
		setNow(Date.now())
		onReset()
	}

	const runningMinutes = () => {
		const ms =
			accumRef.current +
			(runStartRef.current == null
				? 0
				: Math.max(0, Date.now() - runStartRef.current))
		return ms >= 1000 ? Math.max(1, Math.round(ms / 60000)) : null
	}

	return {
		running,
		finished,
		side,
		elapsedMs,
		sideElapsedMs,
		start,
		pause,
		resume,
		switchSide,
		finish,
		reset,
		runningMinutes,
	}
}

interface FeedingTimerCardProps {
	method: string
	timer: FeedingTimer
}

export default function FeedingTimerCard({
	method,
	timer,
}: FeedingTimerCardProps) {
	const showSides = method === 'breast' || method === 'mixed'
	const hasProgress = timer.elapsedMs >= 1000
	const minutes = Math.max(1, Math.round(timer.elapsedMs / 60000))

	return (
		<View className='feed-timer'>
			<View className='feed-timer-head'>
				<View className='feed-timer-title-row'>
					<Text className='feed-timer-title'>喂奶计时</Text>
					{timer.running && (
						<View className='feed-timer-live'>
							<View className='feed-timer-live-dot' />
							<Text className='feed-timer-live-text'>计时中</Text>
						</View>
					)}
				</View>
				<Text className='feed-timer-state'>
					{timer.finished
						? `计时 ${minutes} 分钟`
						: timer.running
							? '宝宝慢慢喝'
							: hasProgress
								? '已暂停'
								: '可选'}
				</Text>
			</View>

			<View className='feed-timer-main'>
				<Text className='feed-timer-clock'>{formatClock(timer.elapsedMs)}</Text>
				{showSides && (
					<View className='feed-timer-sides'>
						{(['left', 'right'] as const).map(s => (
							<View
								key={s}
								className={`feed-timer-side${timer.side === s ? ' active' : ''}${
									timer.finished ? ' disabled' : ''
								}`}
								onClick={() => timer.switchSide(s)}
							>
								<Text className='feed-timer-side-label'>
									{s === 'left' ? '左侧' : '右侧'}
								</Text>
								<Text className='feed-timer-side-time'>
									{formatClock(timer.sideElapsedMs[s])}
								</Text>
							</View>
						))}
					</View>
				)}
			</View>

			<View className='feed-timer-actions'>
				{!hasProgress && !timer.running && (
					<View className='feed-timer-btn primary' onClick={timer.start}>
						<Text className='feed-timer-btn-text primary'>开始计时</Text>
					</View>
				)}
				{timer.running && (
					<>
						<View className='feed-timer-btn ghost' onClick={timer.pause}>
							<Text className='feed-timer-btn-text'>暂停</Text>
						</View>
						<View className='feed-timer-btn primary' onClick={timer.finish}>
							<Text className='feed-timer-btn-text primary'>结束并填入</Text>
						</View>
					</>
				)}
				{!timer.running && hasProgress && !timer.finished && (
					<>
						<View className='feed-timer-btn ghost' onClick={timer.resume}>
							<Text className='feed-timer-btn-text'>继续</Text>
						</View>
						<View className='feed-timer-btn primary' onClick={timer.finish}>
							<Text className='feed-timer-btn-text primary'>结束并填入</Text>
						</View>
					</>
				)}
				{timer.finished && (
					<View className='feed-timer-btn ghost' onClick={timer.reset}>
						<Text className='feed-timer-btn-text'>重新计时</Text>
					</View>
				)}
			</View>

			{!timer.running && !hasProgress && (
				<Text className='feed-timer-hint'>
					{showSides
						? '亲喂可切换左右侧，结束后自动填入时长'
						: '计时结束后自动填入时长'}
				</Text>
			)}
		</View>
	)
}
