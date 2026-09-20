import { View, Text } from '@tarojs/components'
import './index.scss'

interface SubscriptionPromptSheetProps {
	/** 组合请求里是否包含疫苗提醒（决定文案） */
	showVaccine: boolean
	/** 微信授权请求进行中（置灰按钮防重复 tap） */
	busy?: boolean
	onEnable: () => void
	onLater: () => void
}

/**
 * 「价值预告」半屏卡：记录保存成功后盖在页面上。
 * 必须等用户在卡上主动点「开启提醒」，在该 tap 回调里才调 requestSubscribeMessage——
 * 直接弹微信授权框没有解释机会，转化率低且容易被拒。
 */
export default function SubscriptionPromptSheet({
	showVaccine,
	busy,
	onEnable,
	onLater,
}: SubscriptionPromptSheetProps) {
	return (
		<View className='sub-prompt-mask' onClick={onLater}>
			<View className='sub-prompt-card' onClick={e => e.stopPropagation()}>
				<Text className='sub-prompt-title'>别让今天的用心溜走</Text>
				<Text className='sub-prompt-desc'>
					每晚 9 点，把宝宝一天的回顾（喂奶次数、日期）发到微信上
				</Text>
				{showVaccine && (
					<Text className='sub-prompt-desc'>
						接种日前 3 天，也会提前提醒你下一针的安排
					</Text>
				)}
				<Text className='sub-prompt-note'>随时可在小程序里关闭，不发别的消息</Text>
				<View
					className={`sub-prompt-enable${busy ? ' busy' : ''}`}
					onClick={busy ? undefined : onEnable}
				>
					<Text className='sub-prompt-enable-text'>
						{busy ? '开启中…' : '开启提醒'}
					</Text>
				</View>
				<View className='sub-prompt-later' onClick={onLater}>
					<Text className='sub-prompt-later-text'>以后再说</Text>
				</View>
			</View>
		</View>
	)
}
