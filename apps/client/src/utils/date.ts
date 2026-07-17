/**
 * 计算宝宝的月龄和天数
 */
export function calculateAge(birthday: string): { months: number; days: number } {
  const birthDate = new Date(birthday);
  const today = new Date();

  // 未来日期直接返回 0
  if (birthDate > today) {
    return { months: 0, days: 0 };
  }

  // 计算月龄
  let months = (today.getFullYear() - birthDate.getFullYear()) * 12;
  months += today.getMonth() - birthDate.getMonth();

  // 如果还没到出生日，减一个月
  if (today.getDate() < birthDate.getDate()) {
    months--;
  }

  // 计算剩余天数
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - (today.getDate() < birthDate.getDate() ? 1 : 0), birthDate.getDate());
  const days = Math.floor((today.getTime() - lastMonthDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    months: Math.max(0, months),
    days: Math.max(0, days),
  };
}

/**
 * 格式化日期
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化时长（分钟）为简短形式 "x时y分" / "x分"，用于图表等空间紧凑的场景
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`;
}

/**
 * 格式化时长（分钟）为完整形式 "x小时y分" / "x分钟"
 */
export function formatDurationLong(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
}

/**
 * 格式化日期为 "HH:mm"
 */
export function formatHM(date: string | Date): string {
  const d = new Date(date);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
