import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// 后台系统设置：键值对存储，值用 JSON 方便以后扩展数字/字符串/数组。
// 默认值不落库，统一由 SystemSettingsService 的配置定义提供。
@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ name: 'setting_key', length: 64, comment: '配置键' })
  key: string;

  @Column({ type: 'json', comment: '配置值（JSON）' })
  value: any;

  @Column({
    name: 'updated_by',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '最后修改的管理员',
  })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
