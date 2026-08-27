import { useCallback, useEffect, useState } from 'react';
import { Avatar, Card, Input, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { apiGet } from '../api/client';
import type { AdminUser } from '../types';

export default function Users() {
	const [list, setList] = useState<AdminUser[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [keyword, setKeyword] = useState('');
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<{ list: AdminUser[]; total: number; page: number; pageSize: number }>(
				'/users',
				{ page, pageSize, keyword: keyword || undefined },
			);
			setList(data.list);
			setTotal(data.total);
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, keyword]);

	useEffect(() => {
		load();
	}, [load]);

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
		{ title: '宝宝数', dataIndex: 'babyCount', width: 90, align: 'center' },
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
		</Card>
	);
}
