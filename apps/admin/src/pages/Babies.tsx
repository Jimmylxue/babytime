import { useCallback, useEffect, useState } from 'react';
import { Avatar, Card, Input, Select, Table } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { apiGet } from '../api/client';
import { GENDER_LABELS, formatAge } from '../constants';
import type { BabyListItem } from '../types';

const SORT_OPTIONS = [
	{ label: '按最近活跃', value: 'active' },
	{ label: '按记录数', value: 'records' },
	{ label: '按创建时间', value: 'created' },
];

export default function Babies() {
	const [list, setList] = useState<BabyListItem[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [keyword, setKeyword] = useState('');
	const [sort, setSort] = useState('active');
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<{ list: BabyListItem[]; total: number }>('/babies', {
				page,
				pageSize,
				keyword: keyword || undefined,
				sort,
			});
			setList(data.list);
			setTotal(data.total);
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, keyword, sort]);

	useEffect(() => {
		load();
	}, [load]);

	const columns = [
		{
			title: '宝宝',
			dataIndex: 'name',
			width: 180,
			render: (_: string, record: BabyListItem) => (
				<Link to={`/babies/${record.id}`}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<Avatar src={record.avatar ?? undefined}>{(record.name || '宝')[0]}</Avatar>
						<span style={{ color: 'inherit' }}>{record.name}</span>
					</div>
				</Link>
			),
		},
		{ title: '性别', dataIndex: 'gender', width: 90, render: (v: string) => GENDER_LABELS[v] ?? v },
		{ title: '月龄', dataIndex: 'birthday', width: 110, render: (v: string) => formatAge(v) },
		{
			title: '家长',
			dataIndex: 'parent',
			width: 160,
			render: (parent: BabyListItem['parent']) => parent?.nickname || '-',
		},
		{ title: '家庭成员', dataIndex: 'familyCount', width: 100, align: 'center' as const },
		{ title: '记录数', dataIndex: 'recordCount', width: 90, align: 'center' as const },
		{ title: '照片数', dataIndex: 'photoCount', width: 90, align: 'center' as const },
		{
			title: '最近活跃',
			dataIndex: 'lastRecordAt',
			width: 170,
			render: (v: string | null) =>
				v ? (
					<span>
						{dayjs(v).format('YYYY-MM-DD HH:mm')}
						<TagQuiet days={dayjs().diff(dayjs(v), 'day')} />
					</span>
				) : (
					<span style={{ color: '#999' }}>暂无记录</span>
				),
		},
	];

	return (
		<Card
			title="宝宝列表"
			extra={
				<div style={{ display: 'flex', gap: 8 }}>
					<Select value={sort} onChange={(v) => setSort(v)} options={SORT_OPTIONS} style={{ width: 140 }} />
					<Input.Search
						allowClear
						placeholder="按宝宝/家长昵称搜索"
						style={{ width: 220 }}
						onSearch={(value) => {
							setPage(1);
							setKeyword(value.trim());
						}}
					/>
				</div>
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
					showTotal: (t) => `共 ${t} 位宝宝`,
					onChange: (nextPage, nextPageSize) => {
						setPage(nextPage);
						setPageSize(nextPageSize);
					},
				}}
			/>
		</Card>
	);
}

function TagQuiet({ days }: { days: number }) {
	if (days < 7) {
		return <span style={{ marginLeft: 8, fontSize: 12, color: '#52c41a' }}>{days} 天前</span>;
	}
	if (days < 30) {
		return <span style={{ marginLeft: 8, fontSize: 12, color: '#faad14' }}>{days} 天前</span>;
	}
	return <span style={{ marginLeft: 8, fontSize: 12, color: '#ff4d4f' }}>{days} 天前</span>;
}
