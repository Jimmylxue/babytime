import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Baby } from '../../baby/entities/baby.entity';

// 记录类型
export enum RecordType {
  FEEDING = 'feeding',           // 喂奶
  DIAPER = 'diaper',             // 换尿布
  SLEEP = 'sleep',               // 睡觉
  FOOD = 'food',                 // 辅食
  WATER = 'water',               // 喝水
  TEMPERATURE = 'temperature',   // 体温
  HEIGHT_WEIGHT = 'height_weight', // 身高体重
  MEDICINE = 'medicine',         // 用药
  VACCINE = 'vaccine',           // 疫苗
  BATH = 'bath',                 // 洗澡
  OUTDOOR = 'outdoor',           // 户外活动
  OTHER = 'other',               // 其他
}

// 喂奶方式
export enum FeedingMethod {
  BREAST_LEFT = 'breast_left',    // 左侧母乳
  BREAST_RIGHT = 'breast_right',  // 右侧母乳
  BREAST_BOTH = 'breast_both',    // 双侧母乳
  FORMULA = 'formula',            // 奶粉
}

// 尿布状态
export enum DiaperStatus {
  WET = 'wet',        // 尿了
  DIRTY = 'dirty',    // 拉了
  BOTH = 'both',      // 都有
}

@Entity('records')
export class Record {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'baby_id' })
  babyId: string;

  @Column({
    type: 'enum',
    enum: RecordType,
  })
  type: RecordType;

  @Column({ name: 'start_time', type: 'datetime' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'datetime', nullable: true })
  endTime: Date;

  // 喂奶相关
  @Column({
    name: 'feeding_method',
    type: 'enum',
    enum: FeedingMethod,
    nullable: true,
  })
  feedingMethod: FeedingMethod;

  @Column({ name: 'amount', type: 'int', nullable: true, comment: '奶量(ml)' })
  amount: number;

  @Column({ name: 'duration', type: 'int', nullable: true, comment: '时长(分钟)' })
  duration: number;

  // 尿布相关
  @Column({
    name: 'diaper_status',
    type: 'enum',
    enum: DiaperStatus,
    nullable: true,
  })
  diaperStatus: DiaperStatus;

  // 辅食/饮水相关
  @Column({ name: 'food_name', nullable: true, comment: '辅食名称' })
  foodName: string;

  // 体温
  @Column({ name: 'temperature', type: 'decimal', precision: 4, scale: 1, nullable: true, comment: '体温(°C)' })
  temperature: number;

  // 身高体重
  @Column({ name: 'height', type: 'decimal', precision: 5, scale: 1, nullable: true, comment: '身高(cm)' })
  height: number;

  @Column({ name: 'weight', type: 'decimal', precision: 5, scale: 2, nullable: true, comment: '体重(kg)' })
  weight: number;

  // 用药相关
  @Column({ name: 'medicine_name', nullable: true, comment: '药品名称' })
  medicineName: string;

  @Column({ name: 'medicine_dose', nullable: true, comment: '用药剂量' })
  medicineDose: string;

  // 疫苗相关
  @Column({ name: 'vaccine_name', nullable: true, comment: '疫苗名称' })
  vaccineName: string;

  @Column({ name: 'vaccine_hospital', nullable: true, comment: '接种医院' })
  vaccineHospital: string;

  // 户外活动
  @Column({ name: 'outdoor_location', nullable: true, comment: '活动地点' })
  outdoorLocation: string;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string;

  @ManyToOne(() => Baby)
  @JoinColumn({ name: 'baby_id' })
  baby: Baby;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
