/** 经 nginx 反代时 req.ip 是回环地址，真实来源在转发链的第一段 */
export const clientIpOf = (req: any): string | null => {
  const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)
    ?.split(',')[0]
    ?.trim();
  return forwarded || req.ip || null;
};
