export interface MonthlyTip {
  category: string
  content: string
}

export interface MonthlyTipGroup {
  ageLabel: string
  /**
   * 覆盖的月龄区间 [minMonth, maxMonth)，单位月，右开。
   * 之前是「靠数组下标当月龄」取内容，表只写到 12 个月，满 12 个月后直接返回 null，
   * 发现页的「本月关注」整格消失。改成显式区间后可以跨月龄加粗粒度分组（1 岁以上按半岁/整岁分），
   * 也不会因为中间补一组就把后面全部错位。
   */
  minMonth: number
  maxMonth: number
  tips: MonthlyTip[]
}

export const MONTHLY_TIPS: MonthlyTipGroup[] = [
  {
    ageLabel: '0-1个月',
    minMonth: 0,
    maxMonth: 1,
    tips: [
      { category: '喂养', content: '出生后尽早与妈妈肌肤接触、早吸吮，并坚持按需哺乳。' },
      { category: '睡眠', content: '新生儿每天约睡16-20小时，睡眠周期短是常见现象。' },
      { category: '护理', content: '脐带脱落前保持清洁干燥，洗澡后可轻轻吸干水分。' },
      { category: '发育', content: '触碰宝宝手掌时，他可能会反射性握住你的手指。' },
      { category: '补充', content: '维生素D补充请遵循儿保或医生建议。' },
    ],
  },
  {
    ageLabel: '1-2个月',
    minMonth: 1,
    maxMonth: 2,
    tips: [
      { category: '喂养', content: '继续按需喂养；肠胀气可能让宝宝哭闹增多。' },
      { category: '护理', content: '避免摇晃哄睡，轻柔而有规律的安抚更合适。' },
      { category: '发育', content: '俯卧时，宝宝的头可以短暂抬起约45度。' },
      { category: '互动', content: '可在距眼睛约20厘米处看黑白卡，做短时视觉互动。' },
      { category: '睡眠', content: '夜里连续睡眠的时间可能逐渐变长，个体差异很大。' },
    ],
  },
  {
    ageLabel: '2-3个月',
    minMonth: 2,
    maxMonth: 3,
    tips: [
      { category: '喂养', content: '可尝试建立“吃-玩-睡”的节奏，逐步形成规律作息。' },
      { category: '护理', content: '口水增多时用柔软毛巾轻蘸，保持口周干爽。' },
      { category: '发育', content: '俯卧抬头可接近90度，并能用前臂支撑身体。' },
      { category: '互动', content: '多与宝宝交流，逗引他发出“a、o、e”等元音。' },
      { category: '心智', content: '宝宝会开始自发微笑，也更喜欢看熟悉的人脸。' },
    ],
  },
  {
    ageLabel: '3-4个月',
    minMonth: 3,
    maxMonth: 4,
    tips: [
      { category: '喂养', content: '吃奶效率提高后，喂养间隔可能会有所拉长。' },
      { category: '护理', content: '频繁吃手是在探索世界，保持小手清洁即可。' },
      { category: '发育', content: '翻身是本月常见进展，可能先从仰卧翻到侧卧。' },
      { category: '互动', content: '可用彩色图片进行短时视觉互动，观察宝宝的反应。' },
      { category: '心智', content: '游戏被打断时可能哭闹，宝宝开始表达自己的偏好。' },
    ],
  },
  {
    ageLabel: '4-5个月',
    minMonth: 4,
    maxMonth: 5,
    tips: [
      { category: '睡眠', content: '可逐步建立固定睡前流程，帮助宝宝形成睡眠习惯。' },
      { category: '护理', content: '出牙期可能来临，可提供符合月龄的牙胶缓解不适。' },
      { category: '发育', content: '靠坐时腰部力量增强，可在看护下短暂练习坐起。' },
      { category: '互动', content: '宝宝会主动抓握玩具，也喜欢用嘴探索物品。' },
      { category: '心智', content: '会注意其他小朋友，对周围人的活动更感兴趣。' },
    ],
  },
  {
    ageLabel: '5-6个月',
    minMonth: 5,
    maxMonth: 6,
    tips: [
      { category: '喂养', content: '出现辅食准备信号后，可在儿保建议下尝试含铁辅食。' },
      { category: '护理', content: '喂养后可用干净纱布轻拭牙龈，为口腔清洁做准备。' },
      { category: '发育', content: '可在支撑下独坐片刻，翻身更熟练，也会尝试撕纸。' },
      { category: '互动', content: '从背后叫名字时，宝宝可能会转头寻找声源。' },
      { category: '心智', content: '照护者离开时哭闹，常是依恋关系发展的表现。' },
    ],
  },
  {
    ageLabel: '6-7个月',
    minMonth: 6,
    maxMonth: 7,
    tips: [
      { category: '喂养', content: '奶仍是重要营养来源，可在适应后逐步增加辅食种类和次数。' },
      { category: '护理', content: '反复扔东西等重复动作是在探索，不必急于制止。' },
      { category: '发育', content: '可以直腰坐稳，双手玩玩具，也会左右手传递积木。' },
      { category: '互动', content: '可以讲简单故事、看彩色图片书，保持互动轻松简短。' },
      { category: '心智', content: '会模仿不同声音，可能无意识发出“baba、mama”。' },
    ],
  },
  {
    ageLabel: '7-8个月',
    minMonth: 7,
    maxMonth: 8,
    tips: [
      { category: '喂养', content: '可在看护下尝试更有颗粒感的软烂食物，练习咀嚼。' },
      { category: '护理', content: '认生反应常见，对陌生人犹疑时给予耐心陪伴。' },
      { category: '发育', content: '可能开始腹爬，也可能跳过爬行阶段，发展节奏各有不同。' },
      { category: '互动', content: '拇指和食指配合捏取食物，手部精细动作正在发展。' },
      { category: '心智', content: '开始理解简单指令，也会模仿挥手说“拜拜”。' },
    ],
  },
  {
    ageLabel: '8-9个月',
    minMonth: 8,
    maxMonth: 9,
    tips: [
      { category: '喂养', content: '可在看护下尝试适合月龄的手指食物，鼓励自主进食。' },
      { category: '护理', content: '活动范围变大，注意桌角、插座和小物件等居家安全。' },
      { category: '发育', content: '可扶物站立片刻，坐稳后能自由扭身玩耍。' },
      { category: '互动', content: '用手指指物表达需求，是重要的沟通信号。' },
      { category: '心智', content: '喜欢重复玩躲猫猫等游戏，并从中获得乐趣。' },
    ],
  },
  {
    ageLabel: '9-10个月',
    minMonth: 9,
    maxMonth: 10,
    tips: [
      { category: '喂养', content: '继续提供多样化、适合月龄的食物，接触不同味道和质地。' },
      { category: '护理', content: '抗拒换尿布或穿衣服时，多些耐心并尝试转移注意力。' },
      { category: '发育', content: '可能手膝并用熟练爬行，也可能短暂独自站立。' },
      { category: '互动', content: '能更熟练地用拇指和食指捏起小物品，并主动放下。' },
      { category: '心智', content: '能听懂自己的名字，并以摇头或点头表达意愿。' },
    ],
  },
  {
    ageLabel: '10-11个月',
    minMonth: 10,
    maxMonth: 11,
    tips: [
      { category: '喂养', content: '辅食可逐渐更接近家庭食物，但仍应少盐、少糖、软烂易咀嚼。' },
      { category: '护理', content: '喜欢开抽屉和探索容器时，可准备安全物品供他探索。' },
      { category: '发育', content: '可能会扶着家具挪步，也可牵着大人的手走几步。' },
      { category: '互动', content: '可能有意识地叫“爸爸”“妈妈”，多回应他的表达。' },
      { category: '心智', content: '反复把东西扔到地上，是在学习动作带来的结果。' },
    ],
  },
  {
    ageLabel: '11-12个月',
    minMonth: 11,
    maxMonth: 12,
    tips: [
      { category: '喂养', content: '可和家人一起上桌吃饭，食物仍需单独处理得软烂易咀嚼。' },
      { category: '护理', content: '开始有主见时，可减少强迫，用选择和转移注意力回应。' },
      { category: '发育', content: '能独立站稳，有些宝宝会迈出几步，发展速度各不相同。' },
      { category: '互动', content: '可提供安全的粗杆蜡笔，让宝宝自由涂鸦。' },
      { category: '心智', content: '自我意识进一步增强，喜欢自己做选择或拒绝帮助。' },
    ],
  },
  {
    ageLabel: '1岁-1岁半',
    minMonth: 12,
    maxMonth: 18,
    tips: [
      { category: '喂养', content: '三餐逐渐与家人同步，奶量约每天 400~600ml，少盐少糖仍是重点。' },
      { category: '护理', content: '能走稳后活动范围猛增，插座、桌角、热水壶都要提前做防护。' },
      { category: '发育', content: '多数宝宝能独走，也会蹲下再站起；走路早晚差异很大。' },
      { category: '互动', content: '会指物给你看、把东西递给你，这些都是在分享注意力。' },
      { category: '心智', content: '听得懂简单指令，但「不」比「是」说得更早，属正常现象。' },
    ],
  },
  {
    ageLabel: '1岁半-2岁',
    minMonth: 18,
    maxMonth: 24,
    tips: [
      { category: '喂养', content: '自主进食意愿强，弄脏是过程；保证每天有肉蛋、蔬果和主食。' },
      { category: '护理', content: '开始尝试自己刷牙，家长仍需补刷；建议安排第一次口腔检查。' },
      { category: '发育', content: '可能扶着栏杆上下楼梯，也会尝试踢球、扔球。' },
      { category: '互动', content: '词汇量明显增长，会说两三个字的短句，多和他对话。' },
      { category: '心智', content: '自我意识强烈的「不要期」，给有限选择比直接命令更有效。' },
    ],
  },
  {
    ageLabel: '2岁-2岁半',
    minMonth: 24,
    maxMonth: 30,
    tips: [
      { category: '喂养', content: '食物可以切得稍大一些，继续练习咀嚼；每天保证奶制品摄入。' },
      { category: '护理', content: '如厕训练看信号不看月龄，能在尿布干爽两小时后开始尝试。' },
      { category: '发育', content: '多数能双脚离地跳起、跑得稳，也会自己扶栏下楼。' },
      { category: '互动', content: '开始有「我的」概念，抢玩具是社交发展的正常阶段。' },
      { category: '心智', content: '喜欢重复听同一个故事，重复是他建立安全感的方式。' },
    ],
  },
  {
    ageLabel: '2岁半-3岁',
    minMonth: 30,
    maxMonth: 36,
    tips: [
      { category: '喂养', content: '食量会有波动，看一周总量比看单顿更准；避免用零食代替正餐。' },
      { category: '护理', content: '白天基本能控制大小便，夜间干爽通常要更晚，不必着急。' },
      { category: '发育', content: '能单脚站片刻、会画圆圈，也能自己穿脱宽松的鞋子。' },
      { category: '互动', content: '开始有固定的玩伴，也会轮流和等待，需要大人提示。' },
      { category: '心智', content: '会问大量的「为什么」，认真回答比敷衍更能保护好奇心。' },
    ],
  },
  {
    ageLabel: '3岁-4岁',
    minMonth: 36,
    maxMonth: 48,
    tips: [
      { category: '喂养', content: '饮食基本与家人一致，注意每天 300~500ml 奶及奶制品。' },
      { category: '护理', content: '乳牙全部长出后要认真刷；每半年一次口腔检查更稳妥。' },
      { category: '发育', content: '能单脚跳、自己上下楼梯，握笔姿势开始成形。' },
      { category: '互动', content: '能讲简单的事情经过，也会和同伴商量角色扮演。' },
      { category: '心智', content: '想象力旺盛，分不清想象与现实是阶段特点，不必斥为撒谎。' },
    ],
  },
  {
    ageLabel: '4岁-5岁',
    minMonth: 48,
    maxMonth: 60,
    tips: [
      { category: '喂养', content: '保证每天蔬菜水果和优质蛋白，控制含糖饮料。' },
      { category: '护理', content: '视力发育关键期，控制近距离用眼时长，多安排户外。' },
      { category: '发育', content: '能单脚站立较久、会拍球，也能画出具象的人形。' },
      { category: '互动', content: '有明确的好朋友概念，也会体验分享与冲突后的和好。' },
      { category: '心智', content: '能理解简单规则并遵守，开始在意「公平」。' },
    ],
  },
  {
    ageLabel: '5岁-6岁',
    minMonth: 60,
    maxMonth: 72,
    tips: [
      { category: '喂养', content: '入学前建立规律三餐和固定饮水习惯，比补营养品更重要。' },
      { category: '护理', content: '检查视力与听力，确认疫苗是否按程序完成，准备入学体检。' },
      { category: '发育', content: '能连续跳绳、双脚交替下楼梯，精细动作可完成系扣子。' },
      { category: '互动', content: '能遵守集体规则、轮流等待，开始理解他人的感受。' },
      { category: '心智', content: '可完成 10 以内数量对应，对文字和数字产生兴趣。' },
    ],
  },
]

/**
 * 按宝宝月龄取「本月关注」。
 * 用区间匹配而不是数组下标：满 12 个月后仍有内容，且以后在中间插入分组不会让后面全部错位。
 * 超过最大分组（6 岁）返回最后一组，避免大龄宝宝进来看到「本月关注」整格消失。
 */
export function getMonthlyTips(ageInMonths: number): MonthlyTipGroup | null {
  if (!Number.isFinite(ageInMonths) || ageInMonths < 0) {
    return MONTHLY_TIPS[0] || null
  }
  const matched = MONTHLY_TIPS.find(
    group => ageInMonths >= group.minMonth && ageInMonths < group.maxMonth,
  )
  if (matched) return matched
  // 超出表格范围（≥72 月龄）：沿用最后一组
  return MONTHLY_TIPS[MONTHLY_TIPS.length - 1] || null
}
