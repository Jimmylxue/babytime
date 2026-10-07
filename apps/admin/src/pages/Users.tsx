import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Card, Input, List, Modal, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiGet, apiPost } from '../api/client';
import { GENDER_LABELS, formatAge, formatSourceLabel } from '../constants';
import type {
	AdminUser,
	UserBabyItem,
	UserDeletionCounts,
	UserDeletionPlan,
	UserDeletionResult,
	UserListResult,
	UserSourceCount,
} from '../types';

// 注销弹窗里展示的删除量（顺序即阅读顺序：先宝宝和流水，再关系与推送）
const DELETION_LABELS: { key: keyof UserDeletionCounts; label: string }[] = [
	{ key: 'babies', label: '宝宝档案' },
	{ key: 'records', label: '成长记录' },
	{ key: 'photos', label: '相册照片' },
	{ key: 'milestones', label: '里程碑' },
	{ key: 'vaccinePlans', label: '疫苗计划' },
	{ key: 'invites', label: '邀请卡' },
	{ key: 'familyMembers', label: '其家庭成员' },
	{ key: 'joinedFamilies', label: '加入的他人家庭' },
	{ key: 'aliases', label: '家人备注名' },
	{ key: 'grants', label: '订阅额度' },
	{ key: 'deliveries', label: '推送记录' },
	{ key: 'events', label: '使用埋点' },
	{ key: 'images', label: '图片引用' },
];

/** 注销弹窗正文：不可逆的操作不能只给一个「确定」，要让他看清删了什么、牵连了谁 */
function DeletionPlanSummary({ plan }: { plan: UserDeletionPlan }) {
	const nonZero = DELETION_LABELS.filter((item) => plan.counts[item.key] > 0);
	return (
		<Space direction="vertical" size={10} style={{ width: '100%' }}>
			<Typography.Text>
				<Typography.Text strong>{plan.user.nickname}</Typography.Text>
				{' · OpenID '}{plan.user.openId || '-'}
				{' · 注册于 '}{plan.user.createdAt ? new Date(plan.user.createdAt).toLocaleString('zh-CN', { hour12: false }) : '-'}
			</Typography.Text>
			{plan.babies.length > 0 && (
				<Typography.Text>名下宝宝：{plan.babies.map((baby) => baby.name || '未命名').join('、')}</Typography.Text>
			)}
			{nonZero.length === 0 ? (
				<Alert type="info" showIcon message="该用户名下没有业务数据，只会删除账号本身" />
			) : (
				<>
					<Alert
						type="error"
						showIcon
						message="以下数据会被立即删除，不可恢复"
						description={
							<Space wrap size={[4, 4]}>
								{nonZero.map((item) => (
									<Tag key={item.key} color="red">
										{item.label} {plan.counts[item.key]}
									</Tag>
								))}
							</Space>
						}
					/>
					{plan.impact.sharedMemberUsers > 0 && (
						<Alert
							type="warning"
							showIcon
							message={`他的家庭里还有 ${plan.impact.sharedMemberUsers} 位已加入的家人，注销后这些人一并失去对宝宝的访问`}
						/>
					)}
					{plan.impact.joinedFamilies.length > 0 && (
						<Alert
							type="warning"
							showIcon
							message={`他还加入了 ${plan.impact.joinedFamilies.length} 个他人家庭（${plan.impact.joinedFamilies
								.map((item) => `${item.ownerNickname} 的 ${item.babyName}`)
								.join('、')}），注销后从这些家庭移除`}
						/>
					)}
					{plan.counts.externalActorRows > 0 && (
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							他在别人家宝宝上记的 {plan.counts.externalActorRows} 条属于那个家庭，会保留，只把作者清空。
						</Typography.Text>
					)}
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>
						图片会按全库引用回查后再删，被他人复用的图自动保留；他手上已登录的小程序会话最长还会存活 7 天（旧 token 到期自然失效）。
					</Typography.Text>
				</>
			)}
		</Space>
	);
}

export default function Users() {
	const navigate = useNavigate();
	const [list, setList] = useState<AdminUser[]>([]);
	const [total, setTotal] = useState(0);
	// 来源分布（全量统计，不受当前分页影响）
	const [sourceCounts, setSourceCounts] = useState<UserSourceCount[]>([]);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [keyword, setKeyword] = useState('');
	const [loading, setLoading] = useState(false);

	// 「宝宝数」点击弹窗：记录当前查看的用户，懒加载其宝宝列表
	const [babiesOf, setBabiesOf] = useState<AdminUser | null>(null);
	const [userBabies, setUserBabies] = useState<UserBabyItem[]>([]);
	const [babiesLoading, setBabiesLoading] = useState(false);

	// 注销：先拉删除预览，看清影响面再输确认词，两步都在同一个弹窗里完成
	const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
	const [deletionPlan, setDeletionPlan] = useState<UserDeletionPlan | null>(null);
	const [planLoading, setPlanLoading] = useState(false);
	const [confirmText, setConfirmText] = useState('');
	const [deleting, setDeleting] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<UserListResult>('/users', {
				page,
				pageSize,
				keyword: keyword || undefined,
			});
			setList(data.list);
			setTotal(data.total);
			setSourceCounts(data.sourceCounts || []);
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, keyword]);

	useEffect(() => {
		load();
	}, [load]);

	const showBabies = async (user: AdminUser) => {
		setBabiesOf(user);
		setUserBabies([]);
		setBabiesLoading(true);
		try {
			const data = await apiGet<{ list: UserBabyItem[] }>(`/users/${user.id}/babies`);
			setUserBabies(data.list);
		} finally {
			setBabiesLoading(false);
		}
	};

	const goBabyDetail = (babyId: string) => {
		setBabiesOf(null);
		navigate(`/babies/${babyId}`);
	};

	const openDelete = async (user: AdminUser) => {
		setDeleteTarget(user);
		setDeletionPlan(null);
		setConfirmText('');
		setPlanLoading(true);
		try {
			setDeletionPlan(await apiGet<UserDeletionPlan>(`/users/${user.id}/deletion-preview`));
		} finally {
			setPlanLoading(false);
		}
	};

	const closeDelete = () => {
		setDeleteTarget(null);
		setDeletionPlan(null);
		setConfirmText('');
	};

	const submitDelete = async () => {
		if (!deleteTarget || !deletionPlan) return;
		setDeleting(true);
		try {
			const result = await apiPost<UserDeletionResult>(`/users/${deleteTarget.id}/delete`, {
				confirm: deletionPlan.confirmWord,
			});
			message.success(
				`已注销「${result.nickname}」：删除 ${result.counts.babies} 个宝宝档案、${result.counts.records} 条记录、${result.counts.photos} 张照片`,
			);
			closeDelete();
			load();
		} catch (error: any) {
			message.error(error?.message || '注销失败');
		} finally {
			setDeleting(false);
		}
	};

	const columns: ColumnsType<AdminUser> = [
		{
			title: '用户',
			dataIndex: 'nickname',
			width: 220,
			render: (_, record) => (
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<Avatar src={record.avatar ?? undefined}>{(record.nickname || '微')[0]}</Avatar>
					<span>{record.nickname || '微信用户'}</span>
				</div>
			),
		},
		{
			title: '来源',
			dataIndex: 'acquisitionSource',
			width: 100,
			render: (value: string | null) =>
				value ? (
					<Tag color="pink">{formatSourceLabel(value)}</Tag>
				) : (
					<Typography.Text type="secondary">自然流入</Typography.Text>
				),
		},
		{ title: 'OpenID', dataIndex: 'openId', width: 160 },
		{
			title: '宝宝数',
			dataIndex: 'babyCount',
			width: 90,
			align: 'center',
			render: (value: number, record) =>
				value > 0 ? (
					<a onClick={() => showBabies(record)}>{value}</a>
				) : (
					<span>0</span>
				),
		},
		{ title: '记录数', dataIndex: 'recordCount', width: 90, align: 'center', sorter: (a, b) => a.recordCount - b.recordCount },
		{
			title: '注册时间',
			dataIndex: 'createdAt',
			width: 190,
			render: (value: string) => (value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'),
		},
		{
			title: '操作',
			key: 'actions',
			width: 90,
			fixed: 'right',
			render: (_, record) => (
				<Button danger size="small" onClick={() => openDelete(record)}>
					注销
				</Button>
			),
		},
	];

	return (
		<Card
			title="用户列表"
			extra={
				<Input.Search
					allowClear
					placeholder="按昵称搜索"
					style={{ width: 240 }}
					onSearch={(value) => {
						setPage(1);
						setKeyword(value.trim());
					}}
				/>
			}
		>
			{sourceCounts.length > 0 && (
				<div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
					<Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 2 }}>
						来源分布
					</Typography.Text>
					{/* 有归因的排前面（这才是要看的），自然流入垫底 */}
					{[...sourceCounts]
						.sort((a, b) => {
							const aOrganic = !a.source;
							const bOrganic = !b.source;
							if (aOrganic !== bOrganic) return aOrganic ? 1 : -1;
							return b.count - a.count;
						})
						.map((item) => (
							<Tag key={item.source || 'organic'} color={item.source ? 'pink' : 'default'}>
								{formatSourceLabel(item.source)} {item.count}
							</Tag>
						))}
				</div>
			)}
			<Table
				rowKey="id"
				columns={columns}
				dataSource={list}
				loading={loading}
				scroll={{ x: 1030 }}
				pagination={{
					current: page,
					pageSize,
					total,
					showSizeChanger: true,
					showTotal: (t) => `共 ${t} 位用户`,
					onChange: (nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					},
				}}
			/>

			<Modal
				open={babiesOf !== null}
				title={babiesOf ? `${babiesOf.nickname || '微信用户'} 的宝宝（${userBabies.length}）` : ''}
				footer={null}
				onCancel={() => setBabiesOf(null)}
				width={420}
			>
				{babiesLoading ? (
					<div style={{ textAlign: 'center', padding: 32 }}>
						<Spin />
					</div>
				) : userBabies.length === 0 ? (
					<div style={{ textAlign: 'center', padding: 24, color: '#999' }}>该用户还没有创建宝宝档案</div>
				) : (
					<List
						dataSource={userBabies}
						renderItem={(baby) => (
							<List.Item
								style={{ cursor: 'pointer', padding: '10px 4px' }}
								onClick={() => goBabyDetail(baby.id)}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
									<Avatar src={baby.avatar ?? undefined}>{(baby.name || '宝')[0]}</Avatar>
								<div style={{ flex: 1 }}>
									<div>{baby.name || '宝宝'}</div>
									<span style={{ fontSize: 12, color: '#999' }}>
										{GENDER_LABELS[baby.gender] ?? baby.gender} · {formatAge(baby.birthday) || '-'}
									</span>
								</div>
								<RightOutlined style={{ color: '#bbb', fontSize: 12 }} />
								</div>
							</List.Item>
						)}
					/>
				)}
			</Modal>

			<Modal
				open={deleteTarget !== null}
				title={`注销账号：${deleteTarget?.nickname || '微信用户'}`}
				okText="确认注销并删除数据"
				cancelText="取消"
				okButtonProps={{
					danger: true,
					loading: deleting,
					disabled: !deletionPlan || confirmText !== deletionPlan.confirmWord,
				}}
				onOk={submitDelete}
				onCancel={closeDelete}
				width={560}
			>
				{planLoading ? (
					<div style={{ textAlign: 'center', padding: 32 }}>
						<Spin />
					</div>
				) : !deletionPlan ? (
					<Alert
						type="warning"
						showIcon
						message="删除预览加载失败"
						description="关掉弹窗重试。预览没出来时不给提交，避免在不知道删了什么的情况下注销。"
					/>
				) : (
					<DeletionPlanSummary plan={deletionPlan} />
				)}
				{deletionPlan && (
					<Input
						style={{ marginTop: 12 }}
						placeholder={`输入「${deletionPlan.confirmWord}」后才可以提交`}
						value={confirmText}
						onChange={(event) => setConfirmText(event.target.value)}
					/>
				)}
			</Modal>
		</Card>
	);
}
