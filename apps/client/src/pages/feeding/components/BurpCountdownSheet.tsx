import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'

const BURP_DURATION_MS = 5 * 60 * 1000

const formatClock = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(minutes)}:${pad(seconds)}`
}

interface BurpCountdownSheetProps {
	show: boolean
	onClose: (result: 'done' | 'skip') => void
}

// 保存喂奶记录后的 5 分钟拍嗝倒计时。倒计时按结束时间戳算，
// 退后台再回来会按真实时间校正；到点震动 + 提示，2 秒后自动收尾。
export default function BurpCountdownSheet({
	show,
	onClose,
}: BurpCountdownSheetProps) {
	const [endAt, setEndAt] = useState(0)
	const [now, setNow] = useState(() => Date.now())
	const [finished, setFinished] = useState(false)
	const finishHandledRef = useRef(false)
	const closedRef = useRef(false)
	const close = (result: 'done' | 'skip') => {
		if (closedRef.current) return
		closedRef.current = true
		onClose(result)
	}
	const closeRef = useRef(close)
	closeRef.current = close

	useEffect(() => {
		if (!show) return
		setEndAt(Date.now() + BURP_DURATION_MS)
		setNow(Date.now())
		setFinished(false)
		finishHandledRef.current = false
		closedRef.current = false
		const timer = setInterval(() => setNow(Date.now()), 500)
		return () => clearInterval(timer)
	}, [show])

	const remainingMs =
		endAt === 0 ? BURP_DURATION_MS : Math.max(0, endAt - now)

	useEffect(() => {
		if (!show || endAt === 0 || remainingMs > 0 || finishHandledRef.current)
			return
		finishHandledRef.current = true
		setFinished(true)
		void Taro.vibrateShort({ type: 'light' }).catch(() => undefined)
		Taro.showToast({
			title: '拍嗝时间到，可以放下宝宝啦',
			icon: 'none',
			duration: 2000,
		})
		const timer = setTimeout(() => closeRef.current('done'), 2000)
		return () => clearTimeout(timer)
	}, [show, endAt, remainingMs])

	if (!show) return null

	const progress = Math.min(1, Math.max(0, 1 - remainingMs / BURP_DURATION_MS))

	return (
		<View
			className='burp-mask'
			catchMove
			onClick={() => close('skip')}
		>
			<View className='burp-card' onClick={e => e.stopPropagation()}>
				<View className='burp-saved'>
					<Text className='burp-saved-text'>✓ 已记录</Text>
				</View>
				<Text className='burp-title'>
					{finished ? '拍嗝完成' : '喂完啦，记得拍嗝'}
				</Text>
				<Text className='burp-desc'>
					{finished
						? '可以放下宝宝啦，记得让他侧躺一会儿'
						: '竖抱宝宝，头靠在肩上，空心掌轻拍后背'}
				</Text>
				<Text className='burp-clock'>{formatClock(remainingMs)}</Text>
				<View className='burp-progress'>
					<View
						className='burp-progress-fill'
						style={{ width: `${progress * 100}%` }}
					/>
				</View>
				<View className='burp-actions'>
					<View className='burp-primary' onClick={() => close('done')}>
						<Text className='burp-primary-text'>
							{finished ? '完成' : '完成拍嗝'}
						</Text>
					</View>
					{!finished && (
						<View className='burp-skip' onClick={() => close('skip')}>
							<Text className='burp-skip-text'>先不拍了</Text>
						</View>
					)}
				</View>
			</View>
		</View>
	)
}
