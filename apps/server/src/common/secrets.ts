import { createHash, timingSafeEqual } from 'crypto';

/**
 * 比对秘密值（告警 token、回调签名一类）。
 *
 * `a === b` 在第一个不相等的字符处就返回，攻击者反复请求测耗时能一位一位试出正确值；
 * 两边先各过一次 SHA-256 再比，长度就与原文无关，也不用处理 timingSafeEqual
 * 对不等长输入直接抛错的问题（抛错本身也是一种时序泄露）。
 */
export function secretsEqual(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
