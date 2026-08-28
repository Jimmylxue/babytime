import { useCallback, useEffect, useState } from 'react';
import {
	Avatar,
	Card,
	Col,
	Descriptions,
	Empty,
	Row,
	Spin,
	Tag,
	Timeline,
	Typography,
	Button,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { apiGet } from '../api/client';
import { GENDER_LABELS, RECORD_TYPE_LABELS, formatAge } from '../constants';
import type { BabyDetail as BabyDetailData } from '../types';

const ROLE_LABELS: Record<string, string> = {
	father: '爸爸',
	mother: '妈妈',
	grandfather: '爷爷',
	grandmother: '奶奶',
	other: '其他',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
	accepted: { label: '已加入', color: 'green' },
	pending: { label: '待接受', color: 'orange' },
	rejected: { label: '已拒绝', color: 'default' },
};

const RISK_MAP: Record<string, { label: string; color: string }> = {
	normal: { label: '正常', color: 'green' },
	observe: { label: '需观察', color: 'orange' },
	medical_attention: { label: '建议就医', color: 'red' },
	urgent: { label: '需紧急处理', color: 'red' },
	unknown: { label: '未知', color: 'default' },
};

function formatRecordLine(type: string, duration: number | null, amount: number | null, note: string | null) {
	const parts: string[] = [];
	if (amount != null) parts.push(`${amount}ml`);
	if (duration != null) parts.push(`${duration} 分钟`);
	if (note) parts.push(note);
	return parts.join(' · ') || (RECORD_TYPE_LABELS[type] ?? type);
}

export default function BabyDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [data, setData] = useState<BabyDetailData>();

	const load = useCallback(async () => {
		if (!id) return;
		const result = await apiGet<BabyDetailData>(`/babies/${id}`);
		setData(result);
	}, [id]);

	useEffect(() => {
		load();
	}, [load]);

	if (!data) {
		return (
			<div style={{ textAlign: 'center', padding: 80 }}>
				<Spin />
			</div>
		);
	}

	const { baby, stats } = data;
	const maxTypeCount = Math.max(...data.recordTypes.map((t) => t.count), 1);

	return (
		<div>
			<Button
				icon={<ArrowLeftOutlined />}
				type="text"
				style={{ marginBottom: 12 }}
				onClick={() => navigate('/babies')}
			>
				返回宝宝列表
			</Button>

			<Card style={{ marginBottom: 16 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
					<Avatar size={56} src={baby.avatar ?? undefined}>
						{(baby.name || '宝')[0]}
					</Avatar>
					<div>
						<Typography.Title level={4} style={{ margin: 0 }}>
							{baby.name}
						</Typography.Title>
						<Typography.Text type="secondary">
							{GENDER_LABELS[baby.gender]} · {formatAge(baby.birthday)}
						</Typography.Text>
					</div>
				</div>
				<Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
					<Descriptions.Item label="出生日期">
						{baby.birthday ? dayjs(baby.birthday).format('YYYY-MM-DD') : '-'}
					</Descriptions.Item>
					<Descriptions.Item label="家长">{baby.parent?.nickname || '-'}</Descriptions.Item>
					<Descriptions.Item label="记录数">{stats.recordCount}</Descriptions.Item>
					<Descriptions.Item label="照片数">{stats.photoCount}</Descriptions.Item>
					<Descriptions.Item label="首条记录">
						{stats.firstRecordAt ? dayjs(stats.firstRecordAt).format('YYYY-MM-DD HH:mm') : '-'}
					</Descriptions.Item>
					<Descriptions.Item label="最近记录">
						{stats.lastRecordAt ? dayjs(stats.lastRecordAt).format('YYYY-MM-DD HH:mm') : '-'}
					</Descriptions.Item>
					<Descriptions.Item label="建档时间">{dayjs(baby.createdAt).format('YYYY-MM-DD')}</Descriptions.Item>
				</Descriptions>
			</Card>

			<Row gutter={16}>
				<Col xs={24} lg={12}>
					<Card title="记录类型分布" className="chart-card" style={{ marginBottom: 16 }}>
						{data.recordTypes.length === 0 ? (
							<Empty description="暂无记录" />
						) : (
							data.recordTypes
								.sort((a, b) => b.count - a.count)
								.map((item) => (
									<div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
										<span style={{ width: 72, textAlign: 'right', color: '#666' }}>
											{RECORD_TYPE_LABELS[item.type] ?? item.type}
										</span>
										<div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 14 }}>
											<div
												style={{
													width: `${(item.count / maxTypeCount) * 100}%`,
													background: '#1677ff',
													height: '100%',
													borderRadius: 4,
												}}
											/>
										</div>
										<span style={{ width: 40 }}>{item.count}</span>
									</div>
								))
						)}
					</Card>

					<Card title={`家庭成员（${data.familyMembers.length}）`} className="chart-card" style={{ marginBottom: 16 }}>
						{data.familyMembers.length === 0 ? (
							<Empty description="暂无成员" />
						) : (
							data.familyMembers.map((member, index) => {
								const status = STATUS_MAP[member.status] ?? { label: member.status, color: 'default' };
								return (
									<div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
										<Avatar src={member.avatar ?? undefined}>{(member.nickname || '微')[0]}</Avatar>
										<span>{member.nickname || '微信用户'}</span>
										<Tag>{ROLE_LABELS[member.role] ?? member.role}</Tag>
										<Tag color={status.color}>{status.label}</Tag>
									</div>
								);
							})
						)}
					</Card>
				</Col>

				<Col xs={24} lg={12}>
					<Card title="最近记录" className="chart-card" style={{ marginBottom: 16 }}>
						{data.recentRecords.length === 0 ? (
							<Empty description="暂无记录" />
						) : (
							<Timeline
								items={data.recentRecords.map((record) => ({
									children: (
										<div>
											<Tag>{RECORD_TYPE_LABELS[record.type] ?? record.type}</Tag>
											<span>{formatRecordLine(record.type, record.duration, record.amount, record.note)}</span>
											<Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
												{dayjs(record.startTime).format('MM-DD HH:mm')}
											</Typography.Text>
										</div>
									),
								}))}
							/>
						)}
					</Card>

					<Card title={`AI 便便分析（${data.aiAnalyses.length}）`} className="chart-card" style={{ marginBottom: 16 }}>
						{data.aiAnalyses.length === 0 ? (
							<Empty description="未使用过 AI 分析" />
						) : (
							data.aiAnalyses.map((item) => {
								const risk = RISK_MAP[item.analysis.riskLevel ?? 'unknown'] ?? RISK_MAP.unknown;
								return (
									<Card key={item.id} size="small" style={{ marginBottom: 12 }} title={
										<span>
											<Tag color={risk.color}>{risk.label}</Tag>
											<Typography.Text type="secondary" style={{ fontSize: 12 }}>
												{dayjs(item.startTime).format('YYYY-MM-DD HH:mm')}
											</Typography.Text>
										</span>
									}>
										<p style={{ margin: '4px 0' }}>{item.analysis.summary}</p>
										{item.analysis.observedFeatures?.color ? (
											<Typography.Text type="secondary" style={{ fontSize: 12 }}>
												颜色：{item.analysis.observedFeatures.color}
												{item.analysis.observedFeatures.consistency ? ` · 性状：${item.analysis.observedFeatures.consistency}` : ''}
											</Typography.Text>
										) : null}
									</Card>
								);
							})
						)}
					</Card>
				</Col>
			</Row>
		</div>
	);
}
