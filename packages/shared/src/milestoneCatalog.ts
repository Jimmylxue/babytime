// 成长里程碑清单 · 前后端唯一数据源（客户端打卡页展示 / 服务端落库校验都从这里 import）
//
// ⚠️ code 是稳定标识：baby_milestones.code 引用它，改名会让用户已打的卡「失联」。
// 新增项直接往数组里追加；已有项只改 title/hint/月龄，不要改 code。
//
// 参考月龄区间取自儿童发育的一般规律（WHO 运动发育窗口、CDC「Learn the Signs. Act Early.」
// 2022 版里程碑清单、中国 0-6 岁儿童发育行为评估的常用口径），取的是「多数孩子在几月龄
// 内做到」的**观察区间**，不是标准也不是诊断线：宝宝之间差 1-2 个月很常见。
// 因此 hint 一律描述「这件事是什么」，不做「晚了怎么办」的建议；页面底部另有免责声明。

export type MilestoneCategory =
  | 'motor' // 大运动
  | 'fine' // 精细动作
  | 'language' // 语言
  | 'cognitive' // 认知
  | 'social' // 社交情感
  | 'daily' // 生活能力

export const MILESTONE_CATEGORIES: { key: MilestoneCategory; label: string }[] = [
  { key: 'motor', label: '大运动' },
  { key: 'fine', label: '精细动作' },
  { key: 'language', label: '语言' },
  { key: 'cognitive', label: '认知' },
  { key: 'social', label: '社交情感' },
  { key: 'daily', label: '生活能力' },
]

export interface MilestoneItem {
  code: string
  title: string
  category: MilestoneCategory
  emoji: string
  /** 参考区间（月龄，含端点） */
  refMinMonths: number
  refMaxMonths: number
  /** 区间文案，预生成避免各端各写一份格式化逻辑 */
  ageLabel: string
  /** 一句话说明：这件事在发育上意味着什么 */
  hint: string
}

const item = (
  code: string,
  title: string,
  category: MilestoneCategory,
  emoji: string,
  refMinMonths: number,
  refMaxMonths: number,
  hint: string,
): MilestoneItem => ({
  code,
  title,
  category,
  emoji,
  refMinMonths,
  refMaxMonths,
  ageLabel:
    refMinMonths === refMaxMonths
      ? `${refMinMonths} 月龄左右`
      : `${refMinMonths}-${refMaxMonths} 个月`,
  hint,
})

export const MILESTONE_CATALOG: MilestoneItem[] = [
  // ── 社交情感 ──
  item('social-smile', '第一次对人微笑', 'social', '😊', 1, 3, '看着你的脸就会笑，是最早的主动交流'),
  item('laugh-out-loud', '第一次笑出声', 'social', '😄', 2, 4, '开心不再只写在脸上，开始用声音告诉你'),
  item('stranger-aware', '认生了、见到熟人会高兴', 'social', '🤗', 6, 12, '分得清亲疏是依恋关系建立的表现，不是「变黏人」'),
  item('wave-bye', '会挥手再见', 'social', '👋', 9, 12, '一个手势对应一句话，象征能力迈了一步'),
  item('play-with-kids', '愿意和别的小朋友一起玩', 'social', '🧑‍🤝‍🧑', 30, 42, '从各玩各的到有了同伴意识'),

  // ── 大运动 ──
  item('lift-head', '趴着能抬起头', 'motor', '🙌', 1, 3, '颈背肌肉的第一次发力，为翻身做准备'),
  item('roll-over', '第一次翻身', 'motor', '🔄', 3, 6, '第一次靠自己改变姿势，从此落下高处有了风险'),
  item('sit-alone', '不用撑也能坐稳', 'motor', '🪑', 6, 9, '坐姿稳了之后，双手被腾出来探索世界'),
  item('crawl', '会爬了', 'motor', '🐾', 7, 10, '活动范围突然变大，家里尖角和插座要重新过一遍'),
  item('pull-stand', '扶着东西站起来', 'motor', '🧍', 8, 11, '从跪到站，腿部力量够了'),
  item('first-steps', '迈出第一步', 'motor', '👣', 11, 15, '第一次不需要扶的位移，通常会激动一整晚'),
  item('walk-alone', '能自己走路了', 'motor', '🚶', 12, 18, '走稳的时间跨度很大，18 个月内走到都算正常'),
  item('run', '会小跑', 'motor', '🏃', 18, 26, '走路收住之后才敢加速，平衡感上一个台阶'),
  item('two-feet-jump', '双脚同时离地跳', 'motor', '🦘', 24, 36, '需要腿部力量和协调一起跟上'),
  item('stairs-holding', '扶着栏杆上下台阶', 'motor', '🪜', 24, 36, '上下楼比走路晚，因为要靠单脚承重'),

  // ── 精细动作 ──
  item('grasp-toy', '会主动伸手抓东西', 'fine', '🤏', 3, 5, '手开始听从眼睛的指挥'),
  item('pass-object', '东西能从一只手换到另一只手', 'fine', '🔄', 5, 8, '双手第一次协同'),
  item('pincer-grasp', '会用拇指和食指捏起小东西', 'fine', '🫳', 8, 11, '捏取出现后，手指的小肌肉开始精细起来'),
  item('use-spoon', '自己用勺子吃', 'fine', '🥄', 15, 24, '手口协调 + 愿意自己动手，两件事得同时到位'),
  item('scribble', '拿着笔在纸上乱画', 'fine', '🖍️', 15, 24, '握笔划动是书写能力最早的前奏'),
  item('stack-blocks', '能搭起 3-4 块积木', 'fine', '🧱', 18, 30, '放得稳需要松手的时机判断'),

  // ── 语言 ──
  item('babble', '开始咿呀学语、会发 ba-ma 的音', 'language', '💬', 6, 9, '发音练习期，还不是有意识的称呼'),
  item('first-word', '有意识地叫「妈妈/爸爸」', 'language', '🗣️', 10, 15, '这一次是冲着人喊的，意义完全不同'),
  item('ten-words', '能说十来个词', 'language', '🔤', 16, 24, '词汇量开始从「几个」变成「一堆」'),
  item('two-word-combo', '会把两个词拼起来（「妈妈抱」）', 'language', '🔗', 20, 30, '从单词到短句的转折点，比词汇量更能说明语言发育'),
  item('full-sentence', '能说完整的短句', 'language', '📣', 28, 40, '开始能讲清楚「刚才发生了什么」'),

  // ── 认知 ──
  item('find-hidden', '能找到被盖住/藏起来的东西', 'cognitive', '🔍', 8, 12, '「看不见了但还在」——客体永久性第一次出现'),
  item('point-at', '会用手指给你看他感兴趣的东西', 'cognitive', '☝️', 12, 18, '主动拉你注意同一件事，是共同注意的开始'),
  item('one-step-instruction', '听得懂一步指令（「把球给我」）', 'cognitive', '🎯', 15, 22, '语言理解跑在表达前面'),
  item('pretend-play', '开始假装玩（给娃娃喂饭）', 'cognitive', '🧸', 20, 30, '象征性游戏出现，想象力开始了'),

  // ── 生活能力 ──
  item('first-tooth', '第一颗乳牙冒出来', 'daily', '🦷', 4, 12, '出牙早晚差异很大，跟长牙顺序一样不必比较'),
  item('first-food', '第一口辅食', 'daily', '🥣', 5, 8, 'WHO 建议满 6 月龄左右添加，最早不早于满 4 月龄'),
  item('night-sleep-long', '夜里能睡长觉了', 'daily', '🌙', 3, 12, '连续睡 5 小时以上通常被算作「睡长觉」，不是断夜奶的指标'),
  item('dress-cooperate', '穿衣服会主动伸手伸脚', 'daily', '👕', 15, 24, '配合穿脱是自理能力的第一步'),
  item('toilet-signs', '会表达要尿尿/拉臭臭', 'daily', '🚽', 18, 36, '能察觉并说出身体信号，如厕训练通常这时才谈得上'),
]

/** 按 code 取清单项；找不到返回 undefined（自定义里程碑没有 code） */
export function findMilestone(code: string | null | undefined): MilestoneItem | undefined {
  if (!code) return undefined
  return MILESTONE_CATALOG.find(m => m.code === code)
}
