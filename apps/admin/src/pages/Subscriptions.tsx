import { useCallback, useEffect, useState } from 'react';
import { Alert, Avatar, Button, Card, Input, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { BellOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiGet, apiPost } from '../api/client';
import type { NotificationSubscription, NotificationSubscriptionResult } from '../types';

export default function Subscriptions() {
	const [list, setList] = useState<NotificationSubscription[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [keyword, setKeyword] = useState('');
	const [loading, setLoading] = useState(false);
	const [sendingUserId, setSendingUserId] = useState<string>();

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<NotificationSubscriptionResult>('/notifications/subscriptions', {
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

	const sendOnce = async (record: NotificationSubscription) => {
		setSendingUserId(record.userId);
		try {
			const result = await apiPost<{ success: boolean; deliveryId: string; availableCount: number }>('/notifications/test', {
				userId: record.userId,
				babyId: record.babyId || undefined,
			});
			message.success(`测试通知已发送，剩余 ${result.availableCount} 次`);
			await load();
		} catch (error: any) {
			message.error(error.message || '测试推送失败');
		} finally {
			setSendingUserId(undefined);
		}
	};

	const columns: ColumnsType<NotificationSubscription> = [
		{
			title: '订阅用户',
			dataIndex: 'nickname',
			width: 210,
			render: (_, record) => (
				<Space>
					<Avatar src={record.avatar ?? undefined}>{(record.nickname || '微')[0]}</Avatar>
					<div>
						<div>{record.nickname || '微信用户'}</div>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.userId.slice(0, 8)}</Typography.Text>
					</div>
				</Space>
			),
		},
		{ title: '宝宝', dataIndex: 'babyName', width: 140, render: (value: string | null) => value || <Typography.Text type="secondary">未找到档案</Typography.Text> },
		{
			title: '订阅状态',
			dataIndex: 'availableCount',
			width: 130,
			render: (value: number) => value > 0 ? <Tag color="green">可发送 {value} 次</Tag> : <Tag>已用完</Tag>,
		},
		{ title: '累计授权', dataIndex: 'acceptedCount', width: 90, align: 'center' },
		{ title: '已发送', dataIndex: 'sentCount', width: 80, align: 'center' },
		{ title: '拒绝次数', dataIndex: 'rejectedCount', width: 90, align: 'center' },
		{ title: '最近授权', dataIndex: 'grantedAt', width: 165, render: (value: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
		{ title: '最近发送', dataIndex: 'lastSentAt', width: 165, render: (value: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
		{
			title: '操作',
			key: 'actions',
			width: 130,
			fixed: 'right',
			render: (_, record) => (
				<Popconfirm
					title="确认直推一次？"
					description={`将消耗 ${record.nickname || '该用户'} 的 1 次疫苗订阅额度，发送一条测试提醒。`}
					okText="确认发送"
					cancelText="取消"
					disabled={record.availableCount <= 0 || !record.babyId}
					onConfirm={() => sendOnce(record)}
				>
					<Button
						type="primary"
						size="small"
						icon={<SendOutlined />}
						disabled={record.availableCount <= 0 || !record.babyId}
						loading={sendingUserId === record.userId}
					>
						直推一次
					</Button>
				</Popconfirm>
			),
		},
	];

	return (
		<Card
			title={<Space><BellOutlined />已订阅用户</Space>}
			extra={
				<Space>
					<Input.Search
						allowClear
						placeholder="搜索用户或宝宝"
						style={{ width: 240 }}
						onSearch={(value) => { setPage(1); setKeyword(value.trim()); }}
					/>
					<Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
				</Space>
			}
		>
			<Alert
				style={{ marginBottom: 16 }}
				type="warning"
				showIcon
				message="直推一次会真实发送微信订阅消息，并消耗用户 1 次订阅额度。仅建议用于测试或明确需要的单次提醒。"
			/>
			<Table
				rowKey="userId"
				columns={columns}
				dataSource={list}
				loading={loading}
				scroll={{ x: 1250 }}
				pagination={{
					current: page,
					pageSize,
					total,
					showSizeChanger: true,
					showTotal: (value) => `共 ${value} 位已授权用户`,
					onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); },
				}}
			/>
		</Card>
	);
}
