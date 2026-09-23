import {
  IsOptional,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const MAX_PROPERTY_KEYS = 16;
const MAX_PROPERTY_KEY_LENGTH = 32;
const MAX_PROPERTY_STRING_LENGTH = 120;

/**
 * properties 直接进 JSON 列，之前一条请求能塞几 MB 就塞几 MB。
 * 现在只收「一层 key → 原始值」，超口径整条拒掉（埋点是 fire-and-forget，
 * 客户端 catch 掉 400 不影响主流程，但脏数据进不了库）。
 */
function propertiesViolation(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'properties 必须是键值对象';
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_PROPERTY_KEYS) {
    return `properties 最多 ${MAX_PROPERTY_KEYS} 个键`;
  }

  for (const [key, item] of entries) {
    if (key.length > MAX_PROPERTY_KEY_LENGTH) {
      return `properties 的键名最长 ${MAX_PROPERTY_KEY_LENGTH} 个字符`;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'number') {
      continue;
    }
    if (typeof item === 'string') {
      if (item.length > MAX_PROPERTY_STRING_LENGTH) {
        return `properties.${key} 最长 ${MAX_PROPERTY_STRING_LENGTH} 个字符`;
      }
      continue;
    }
    return `properties.${key} 只能是字符串或数字`;
  }

  return null;
}

@ValidatorConstraint({ name: 'isTrackEventProperties', async: false })
class IsTrackEventPropertiesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return propertiesViolation(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return propertiesViolation(args.value) ?? 'properties 格式不正确';
  }
}

export function IsTrackEventProperties() {
  return Validate(IsTrackEventPropertiesConstraint);
}

export type TrackEventProperties = Record<string, string | number | boolean | null>;

export class TrackEventDto {
  @Matches(/^[a-z0-9_.-]{1,64}$/i, { message: '事件名称无效' })
  name: string;

  @IsOptional()
  @IsTrackEventProperties()
  properties?: TrackEventProperties;
}
