import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 后台敏感查询审计日志：记录管理员按 ID 查看用户个体数据的每一次动作，
// 用于自证「被动排障查询」而非「主动浏览」（隐私分级约定见 docs/ops-runbook.md）。
@Entity('admin_audit_logs')
@Index('idx_admin_audit_logs_created_at', ['createdAt'])
@Index('idx_admin_audit_logs_target', ['targetType', 'targetId'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_username', length: 64, comment: '操作的管理员用户名' })
  adminUsername: string;

  @Column({ length: 64, comment: '动作标识，如 view_baby_photos' })
  action: string;

  @Column({ name: 'target_type', length: 32, comment: '目标类型，如 baby' })
  targetType: string;

  @Column({ name: 'target_id', length: 64, comment: '目标 ID' })
  targetId: string;

  @Column({ type: 'text', nullable: true, comment: '附加信息（JSON 字符串）' })
  detail: string | null;

  // TS 联合类型（string | null）的装饰器元数据是 Object，必须显式指定列类型
  @Column({ name: 'client_ip', type: 'varchar', length: 64, nullable: true, comment: '管理员来源 IP' })
  clientIp: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
