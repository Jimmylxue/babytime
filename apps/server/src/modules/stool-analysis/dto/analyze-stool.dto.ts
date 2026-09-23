import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * 自家图床白名单。imageUrl 会被原样转给智谱去拉取：不限域就等于
 * 「拿我们的额度与账号去取任意外网内容」，而那张图我们既不过审也不落库。
 * image.jimmyxuexue.top 是历史图片域名，仍在又拍云同一个桶上，一起放行。
 */
const ALLOWED_IMAGE_HOSTS = new Set(['babyimg.jimmyxuexue.top', 'image.jimmyxuexue.top']);

function imageUrlViolation(raw: unknown): string | null {
  if (typeof raw !== 'string') return '图片地址无效';

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '图片地址无效';
  }

  if (url.protocol !== 'https:') return '只支持 https 图片地址';
  if (!ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return '只能分析本站图床上的图片';
  return null;
}

@ValidatorConstraint({ name: 'isOwnCdnImageUrl', async: false })
class IsOwnCdnImageUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return imageUrlViolation(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return imageUrlViolation(args.value) ?? '图片地址无效';
  }
}

export function IsOwnCdnImageUrl() {
  return Validate(IsOwnCdnImageUrlConstraint);
}

export class AnalyzeStoolDto {
  @IsUUID()
  babyId: string;

  @IsUrl({ require_tld: false })
  @IsOwnCdnImageUrl()
  imageUrl: string;

  // 仅用于补充家长主动提供的情况，不应用作诊断依据。
  @IsString()
  @IsOptional()
  @MaxLength(300)
  symptoms?: string;
}
