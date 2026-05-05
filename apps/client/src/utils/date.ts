/**
 * 计算宝宝的月龄和天数
 */
export function calculateAge(birthday: string): { months: number; days: number } {
  const birthDate = new Date(birthday);
  const today = new Date();

  // 计算总天数
  const diffTime = today.getTime() - birthDate.getTime();
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

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
