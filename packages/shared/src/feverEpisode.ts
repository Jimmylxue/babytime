/**
 * 发热病程分析。
 *
 * 场景：宝宝发烧时家长一天量好几次体温，记录散在「体温」类型里，
 * 去医院时医生问「烧了几天、最高多少、什么时候吃的退烧药」——
 * 家长只能凭印象回答。本模块把散落的体温记录整理成「一次病程」。
 *
 * 设计要点：
 * - 一次病程 = 一段连续有发热的时间，中间「退烧且间隔超过 X 小时」视为结束
 * - 只做统计描述，**不下诊断**（不说「可能是xx感染」）
 * - 纯函数，today 由调用方传入，便于测试
 */

/** 判定发热的阈值（℃）。腋温 ≥37.3 为低热，这是儿科常用参考值 */
export const FEVER_THRESHOLD = 37.3

/** 高热的阈值（℃）。≥38.5 通常需要关注是否需要退热药 */
export const HIGH_FEVER_THRESHOLD = 38.5

/** 两次测量间隔超过这么多小时，视为病程中断（多半是已经好了没再量） */
export const EPISODE_GAP_HOURS = 12

export interface TemperaturePoint {
  /** ISO 时间字符串或 Date */
  at: string | Date
  temperature: number
}

export interface FeverEpisode {
  /** 病程开始时间（第一条发热记录） */
  startedAt: Date
  /** 病程最后一条记录时间 */
  lastAt: Date
  /** 持续小时数（按最后一条记录算，不是"治愈时间"） */
  durationHours: number
  /** 病程内测了几次 */
  readings: number
  /** 最高体温 */
  peak: number
  /** 最高体温出现在什么时候 */
  peakAt: Date
  /** 最低体温（用于看退烧药有没有起效） */
  lowest: number
  /** 体温 ≥38.5 的测量次数 */
  highFeverReadings: number
  /** 是否还在进行中（最后一条记录距 now 未超过 EPISODE_GAP_HOURS） */
  ongoing: boolean
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * 把体温记录聚合成病程列表，最近的在前面。
 *
 * @param points 全部体温记录（顺序无关）
 * @param now 当前时间（用于判断病程是否还在进行）
 */
export function buildFeverEpisodes(
  points: TemperaturePoint[],
  now: Date = new Date(),
): FeverEpisode[] {
  // 只保留发热读数和有效数值，按时间正序
  const sorted = points
    .filter((p) => Number.isFinite(p.temperature))
    .map((p) => ({ at: toDate(p.at), temperature: p.temperature }))
    .filter((p) => !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  const episodes: FeverEpisode[] = []
  let current: { at: Date; temperature: number }[] = []

  const flush = () => {
    if (current.length === 0) return;
    const fever = current.filter((p) => p.temperature >= FEVER_THRESHOLD);
    // 整段都没发热就不算一次病程（中间正常读数不足以单独成段）
    if (fever.length > 0) {
      let peakPoint = fever[0];
      let lowest = fever[0].temperature;
      for (const point of fever) {
        if (point.temperature > peakPoint.temperature) peakPoint = point;
        if (point.temperature < lowest) lowest = point.temperature;
      }
      const last = current[current.length - 1];
      const durationHours =
        (last.at.getTime() - fever[0].at.getTime()) / 3600000;
      episodes.push({
        startedAt: fever[0].at,
        lastAt: last.at,
        durationHours: Math.max(0, Math.round(durationHours * 10) / 10),
        readings: current.length,
        peak: peakPoint.temperature,
        peakAt: peakPoint.at,
        lowest,
        highFeverReadings: fever.filter(
          (p) => p.temperature >= HIGH_FEVER_THRESHOLD,
        ).length,
        ongoing:
          now.getTime() - last.at.getTime() <= EPISODE_GAP_HOURS * 3600000,
      });
    }
    current = [];
  }

  for (const point of sorted) {
    if (current.length === 0) {
      current.push(point);
      continue;
    }
    const prev = current[current.length - 1];
    const gapHours = (point.at.getTime() - prev.at.getTime()) / 3600000;
    if (gapHours > EPISODE_GAP_HOURS) {
      flush();
      current.push(point);
    } else {
      current.push(point);
    }
  }
  flush();

  // 最近的病程在前
  return episodes.reverse();
}

/** 取「当前正在发烧」的那次病程，没有则 null */
export function currentEpisode(
  episodes: FeverEpisode[],
): FeverEpisode | null {
  return episodes.find((e) => e.ongoing) ?? null;
}

/**
 * 病程的一句话摘要。用于首页卡片与就医时给医生看。
 * 刻意只描述事实，不给判断。
 */
export function episodeText(episode: FeverEpisode): string {
  const parts: string[] = [];
  parts.push(`最高 ${episode.peak.toFixed(1)}℃`);
  parts.push(
    episode.durationHours < 24
      ? `已持续 ${Math.max(1, Math.round(episode.durationHours))} 小时`
      : `已持续 ${Math.round(episode.durationHours / 24)} 天`,
  );
  parts.push(`测了 ${episode.readings} 次`);
  if (episode.highFeverReadings > 0) {
    parts.push(`${episode.highFeverReadings} 次超 ${HIGH_FEVER_THRESHOLD}℃`);
  }
  return parts.join(' · ');
}

/** 就医提示：只在符合常见指征时提示，且措辞是「建议就诊」不是「必须」 */
export function feverCareHint(episode: FeverEpisode): string | null {
  if (!episode.ongoing) return null;
  const days = episode.durationHours / 24;
  if (days >= 3) return '发热已超过 3 天，建议带宝宝就诊';
  if (episode.peak >= 40) return '体温曾达 40℃ 以上，建议尽快就诊';
  if (episode.highFeverReadings >= 4) return '多次高热，建议就诊确认原因';
  return null;
}
