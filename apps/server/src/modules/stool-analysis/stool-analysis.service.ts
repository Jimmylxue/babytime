import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Baby } from '../baby/entities/baby.entity';
import { AnalyzeStoolDto } from './dto/analyze-stool.dto';
import { StoolAnalysisResult, StoolRiskLevel } from './stool-analysis.types';

const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DISCLAIMER = '图片观察结果仅供健康记录和就医参考，不能替代医生诊断。如宝宝精神差、持续呕吐、发热、脱水或您感到担心，请及时咨询儿科医生。';

@Injectable()
export class StoolAnalysisService {
  constructor(private readonly configService: ConfigService) {}

  async analyze(baby: Baby, dto: AnalyzeStoolDto): Promise<StoolAnalysisResult> {
    const apiKey = this.configService.get<string>('ZHIPU_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('便便图片识别暂未配置，请先在服务端设置 ZHIPU_API_KEY');
    }

    const age = this.getBabyAge(baby.birthday);
    const model = this.configService.get<string>('ZHIPU_VISION_MODEL', 'glm-4v-flash');

    try {
      const response = await axios.post(
        ZHIPU_CHAT_URL,
        {
          model,
          temperature: 0.1,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dto.imageUrl } },
              { type: 'text', text: this.buildPrompt(age, dto.symptoms) },
            ],
          }],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 20000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      return this.normalizeResult(this.parseJsonContent(content));
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('图片暂时无法分析，请确认图片清晰后重试');
    }
  }

  private buildPrompt(age: { months: number; days: number; totalDays: number }, symptoms?: string): string {
    return `你是儿童排便图片的风险提示助手，不是医生，不能做疾病诊断，也不能给出用药建议。
宝宝年龄为 ${age.months} 个月 ${age.days} 天（出生后第 ${age.totalDays} 天）。不同月龄、母乳/配方奶和辅食阶段的排便表现可能不同；未提供喂养信息时不要自行假设。家长补充情况：${symptoms?.trim() || '未提供'}。
请仅根据图片中能直接观察到的颜色、稀稠度和可见异常进行谨慎描述。光线、尿布吸收和食物会影响判断；看不清、不是便便或无法确定时，必须标为无法判断。
若疑似鲜红血、柏油样黑便、白色/灰白陶土色便，或无法排除这些情况，请提高风险等级并建议及时就医；不要声称已经确认疾病。
除 JSON 的字段名和字段枚举值外，所有返回给家长阅读的内容必须使用简体中文，绝不能出现英文单词或英文短语。color 只能是：黄色、黄褐色、绿色、深绿色、红色/血色、黑色、白色/灰白色、无法判断。consistency 只能是：偏软、糊状、稀水样、成形、颗粒/奶瓣样、无法判断。visibleFindings、concerns、guidance、redFlags、summary 都必须是简体中文。
只输出一个 JSON 对象，不要 markdown，不要额外文字。严格使用以下结构：
{
  "stoolDetected": true,
  "imageQuality": "clear",
  "riskLevel": "normal",
  "summary": "不超过60字的谨慎观察结论",
  "observedFeatures": { "color": "", "consistency": "", "visibleFindings": [] },
  "concerns": [],
  "guidance": ["可执行的观察或就医建议，最多3条"],
  "redFlags": [],
  "confidence": "low"
}
字段约束：imageQuality 只能为 clear、unclear、not_stool；riskLevel 只能为 normal、observe、medical_attention、urgent、unknown；confidence 只能为 low、medium、high。`;
  }

  private getBabyAge(birthday: string): { months: number; days: number; totalDays: number } {
    const [year, month, day] = birthday.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.max(0, Math.floor((today.getTime() - birthDate.getTime()) / (24 * 60 * 60 * 1000)));
    let months = (today.getFullYear() - birthDate.getFullYear()) * 12 + today.getMonth() - birthDate.getMonth();
    let monthAnchor = new Date(birthDate);
    monthAnchor.setMonth(monthAnchor.getMonth() + months);
    if (monthAnchor > today) {
      months = Math.max(0, months - 1);
      monthAnchor = new Date(birthDate);
      monthAnchor.setMonth(monthAnchor.getMonth() + months);
    }

    return {
      months,
      days: Math.max(0, Math.floor((today.getTime() - monthAnchor.getTime()) / (24 * 60 * 60 * 1000))),
      totalDays,
    };
  }

  private parseJsonContent(content: unknown): unknown {
    const text = typeof content === 'string' ? content : Array.isArray(content)
      ? content.map((part: any) => part?.text || '').join('')
      : '';
    const matched = text.match(/\{[\s\S]*\}/);
    if (!matched) throw new BadGatewayException('图片分析返回格式异常，请重试');
    try {
      return JSON.parse(matched[0]);
    } catch {
      throw new BadGatewayException('图片分析返回格式异常，请重试');
    }
  }

  private normalizeResult(result: any): StoolAnalysisResult {
    const imageQuality = ['clear', 'unclear', 'not_stool'].includes(result?.imageQuality)
      ? result.imageQuality
      : 'unclear';
    const riskLevel: StoolRiskLevel = ['normal', 'observe', 'medical_attention', 'urgent', 'unknown'].includes(result?.riskLevel)
      ? result.riskLevel
      : 'unknown';
    const stringList = (value: unknown) => Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, 3)
      : [];

    return {
      stoolDetected: Boolean(result?.stoolDetected),
      imageQuality,
      riskLevel: imageQuality === 'not_stool' || imageQuality === 'unclear' ? 'unknown' : riskLevel,
      summary: typeof result?.summary === 'string' ? result.summary.slice(0, 120) : '图片信息不足，暂时无法判断。',
      observedFeatures: {
        color: this.normalizeFeature(result?.observedFeatures?.color, {
          yellow: '黄色',
          'yellow-brown': '黄褐色',
          brown: '黄褐色',
          green: '绿色',
          'dark-green': '深绿色',
          red: '红色/血色',
          black: '黑色',
          white: '白色/灰白色',
          gray: '白色/灰白色',
        }),
        consistency: this.normalizeFeature(result?.observedFeatures?.consistency, {
          soft: '偏软',
          pasty: '糊状',
          watery: '稀水样',
          formed: '成形',
          seedy: '颗粒/奶瓣样',
        }),
        visibleFindings: stringList(result?.observedFeatures?.visibleFindings),
      },
      concerns: stringList(result?.concerns),
      guidance: stringList(result?.guidance),
      redFlags: stringList(result?.redFlags),
      confidence: ['low', 'medium', 'high'].includes(result?.confidence) ? result.confidence : 'low',
      disclaimer: DISCLAIMER,
    };
  }

  private normalizeFeature(value: unknown, englishMappings: Record<string, string>): string {
    if (typeof value !== 'string') return '无法判断';
    const normalized = value.trim().toLowerCase();
    if (englishMappings[normalized]) return englishMappings[normalized];
    // 仅接受纯中文展示值，避免模型偶尔返回英文直接暴露给用户。
    return /[a-z]/i.test(value) ? '无法判断' : value.slice(0, 60) || '无法判断';
  }
}
