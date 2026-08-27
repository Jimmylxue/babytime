export interface MonthlyTip {
  category: string
  content: string
}

export interface MonthlyTipGroup {
  ageLabel: string
  tips: MonthlyTip[]
}

export const MONTHLY_TIPS: MonthlyTipGroup[] = [
  {
    ageLabel: '0-1个月',
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
    tips: [
      { category: '喂养', content: '可和家人一起上桌吃饭，食物仍需单独处理得软烂易咀嚼。' },
      { category: '护理', content: '开始有主见时，可减少强迫，用选择和转移注意力回应。' },
      { category: '发育', content: '能独立站稳，有些宝宝会迈出几步，发展速度各不相同。' },
      { category: '互动', content: '可提供安全的粗杆蜡笔，让宝宝自由涂鸦。' },
      { category: '心智', content: '自我意识进一步增强，喜欢自己做选择或拒绝帮助。' },
    ],
  },
]

export function getMonthlyTips(ageInMonths: number): MonthlyTipGroup | null {
  return MONTHLY_TIPS[ageInMonths] || null
}
