import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemSetting } from './entities/system-setting.entity';

type SettingType = 'boolean';

interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: boolean;
  /** 向小程序公开时的字段名；不填表示仅后台可见 */
  publicKey?: string;
}

const GROUP_LABELS: Record<string, string> = {
  moment: '瞬间',
  community: '育娃圈',
};

// 新增设置项只需在这里加一条；后台页会按 group 自动分组渲染。
const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'moment.originalUploadEnabled',
    group: 'moment',
    label: '允许上传原图',
    description:
      '关闭后，发布瞬间时只上传压缩图，减少上传流量和存储占用；打开后用户可选择「原图」。仅影响新版本小程序，旧版本不受此开关控制。',
    type: 'boolean',
    defaultValue: false,
    publicKey: 'momentOriginalUpload',
  },
  {
    key: 'community.enabled',
    group: 'community',
    label: '开启育娃圈',
    description:
      '开启后，宝宝创建者可以把瞬间公开到育娃圈，所有登录用户可见并可点赞、评论；关闭后小程序隐藏育娃圈入口和公开开关，已有公开内容不再展示但会保留。',
    type: 'boolean',
    defaultValue: false,
    publicKey: 'communityEnabled',
  },
];

@Injectable()
export class SystemSettingsService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private normalize(def: SettingDefinition, raw: unknown): boolean {
    if (raw === undefined) return def.defaultValue;
    return raw === true || raw === 'true';
  }

  // 给小程序用的公开配置：只返回明确标记了 publicKey 的项
  async getClientConfig() {
    const rows = await this.settingsRepository.find();
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const config: Record<string, boolean> = {};
    for (const def of SETTING_DEFINITIONS) {
      if (!def.publicKey) continue;
      config[def.publicKey] = this.normalize(def, values.get(def.key));
    }
    return config;
  }

  async getAdminSettings() {
    const rows = await this.settingsRepository.find();
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));

    const groups: Array<{
      key: string;
      label: string;
      settings: Array<{
        key: string;
        label: string;
        description: string;
        type: SettingType;
        value: boolean;
        updatedAt: Date | null;
        updatedBy: string | null;
      }>;
    }> = [];

    for (const def of SETTING_DEFINITIONS) {
      let group = groups.find((item) => item.key === def.group);
      if (!group) {
        group = {
          key: def.group,
          label: GROUP_LABELS[def.group] || def.group,
          settings: [],
        };
        groups.push(group);
      }
      const row = rowsByKey.get(def.key);
      group.settings.push({
        key: def.key,
        label: def.label,
        description: def.description,
        type: def.type,
        value: this.normalize(def, row?.value),
        updatedAt: row?.updatedAt || null,
        updatedBy: row?.updatedBy || null,
      });
    }

    return { groups };
  }

  async updateSettings(
    adminUsername: string,
    clientIp: string | null,
    changes: Record<string, unknown>,
  ) {
    const definitions = new Map(SETTING_DEFINITIONS.map((def) => [def.key, def]));
    const entries = Object.entries(changes || {});

    // 先整体校验，避免部分写入后才发现某个 key 不合法
    for (const [key, value] of entries) {
      const def = definitions.get(key);
      if (!def) throw new BadRequestException(`未知配置项：${key}`);
      if (def.type === 'boolean' && typeof value !== 'boolean') {
        throw new BadRequestException(`配置项「${def.label}」需要布尔值`);
      }
    }

    if (entries.length === 0) return this.getAdminSettings();

    const rows = await this.settingsRepository.find();
    const current = new Map(rows.map((row) => [row.key, row.value]));
    const changed: Record<string, boolean> = {};
    for (const [key, value] of entries) {
      const def = definitions.get(key)!;
      if (this.normalize(def, current.get(key)) !== value) {
        changed[key] = value as boolean;
      }
    }

    if (Object.keys(changed).length === 0) return this.getAdminSettings();

    await this.dataSource.transaction(async (manager) => {
      await manager.upsert(
        SystemSetting,
        Object.entries(changed).map(([key, value]) => ({
          key,
          value,
          updatedBy: adminUsername,
        })) as any,
        ['key'],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs
          (id, admin_username, action, target_type, target_id, detail, client_ip, created_at)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
        [
          adminUsername,
          'update_system_settings',
          'system',
          'system_settings',
          JSON.stringify({ changes: changed }),
          clientIp,
        ],
      );
    });

    return this.getAdminSettings();
  }
}
