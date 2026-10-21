import { View, Text } from '@tarojs/components'

interface FirstRecordGuideProps {
	/** 宝宝昵称，用于把文案说得像在跟这位家长说话 */
	babyName: string
	/** 主推的记录类型（默认喂奶） */
	onPrimary: () => void
	/** 次级入口：换个记法 */
	onSecondary: () => void
	onDismiss: () => void
}

/**
 * 新用户「记下第一条」引导卡片。
 *
 * 出现条件（由首页判断）：已登录 + 已有宝宝档案 + 该宝宝一条记录都没有。
 * 一旦记过任何一条，hasAnyRecord 变 true，这张卡就不再出现。
 *
 * 设计取舍：
 * - 只推一个主按钮。新用户面对 9 宫格时的真实问题是「先记哪个」，
 *   给三个平等选项等于把选择成本又还给他。喂奶最高频、也最可能是当下正在发生的事。
 * - 文案讲收益（记完能自动算间隔）而不是讲功能（"快速记录"）。
 * - 可关闭且只提示一次：育儿场景不适合阻断式引导，家长此刻多半手忙脚乱。
 */
export default function FirstRecordGuide({
	babyName,
	onPrimary,
	onSecondary,
	onDismiss,
}: FirstRecordGuideProps) {
	return (
		<View className="first-record-guide">
			<View className="frg-head">
				<View className="frg-badge">
					<Text className="frg-badge-text">第 1 步</Text>
				</View>
				<Text className="frg-title">
					{babyName ? `${babyName}的` : ''}第一条记录
				</Text>
				<View className="frg-close" onClick={onDismiss}>
					<Text className="frg-close-icon">✕</Text>
				</View>
			</View>

			<Text className="frg-desc">
				记下这一次，之后每次记录都会自动算出「距上次多久」，半夜喂奶不用再想上次是几点。
			</Text>

			<View className="frg-primary" onClick={onPrimary}>
				<Text className="frg-primary-emoji">🍼</Text>
				<Text className="frg-primary-text">记录第一次喂奶</Text>
				<Text className="frg-primary-arrow">›</Text>
			</View>

			<View className="frg-secondary" onClick={onSecondary}>
				<Text className="frg-secondary-text">或者先记尿布 / 睡眠</Text>
			</View>		</View>
	)
}
