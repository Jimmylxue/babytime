// notification 模块共享的纯函数：模板 ID 读取与本地日期换算。
// 刻意保持无状态：三个 service（计划/发送/微信）都会用到，避免互相依赖。

export function getVaccineTemplateId(): string {
  return process.env.WECHAT_SUBSCRIBE_VACCINE_TEMPLATE_ID || '';
}

export function getReviewTemplateId(): string {
  return process.env.WECHAT_SUBSCRIBE_REVIEW_TEMPLATE_ID || '';
}

/** 出生日 + 月龄 → 疫苗参考日（当天正午，避开夏令时/时区毛刺） */
export function dueDate(birthday: string, months: number): Date {
  const [year, month, day] = birthday.split('-').map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(day, lastDay), 12, 0, 0, 0);
}

export function parseLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
