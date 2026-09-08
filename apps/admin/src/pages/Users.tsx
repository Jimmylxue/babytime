import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Card, Input, List, Modal, Spin, Table } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { apiGet } from '../api/client';
import { GENDER_LABELS, formatAge } from '../constants';
import type { AdminUser, UserBabyItem, UserListResult } from '../types';

export default function Users() {
	const navigate = useNavigate();
	const [list, setList] = useState<AdminUser[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [keyword, setKeyword] = useState('');
	const [loading, setLoading] = useState(false);

	// 「宝宝数」点击弹窗：记录当前查看的用户，懒加载其宝宝列表
	const [babiesOf, setBabiesOf] = useState<AdminUser | null>(null);
	const [userBabies, setUserBabies] = useState<UserBabyItem[]>([]);
	const [babiesLoading, setBabiesLoading] = useState(false);

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
			<Table
				rowKey="id"
				columns={columns}
				dataSource={list}
				loading={loading}
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
		</Card>
	);
}
