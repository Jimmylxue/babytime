import { useCallback, useEffect, useState } from 'react';
import {
	Card,
	Col,
	Empty,
	Input,
	Row,
	Segmented,
	Statistic,
	Table,
	Tag,
	Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { MILESTONE_CATEGORY_LABELS } from '../constants';
import type {
	MilestoneMetrics,
	MilestoneUsageResult,
	MilestoneUsageUser,
} from '../types';

const DAYS_OPTIONS = [
	{ label: '近 14 天', value: 14 },
	{ label: '近 30 天', value: 30 },
	{ label: '近 90 天', value: 90 },
];

const SORT_OPTIONS = [
	{ label: '最近使用', value: 'recent' },
	{ label: '打卡最多', value: 'count' },
];

const pct = (part: number, whole: number) =>
	whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export default function Milestones() {
	const [metrics, setMetrics] = useState<MilestoneMetrics>();
	const [days, setDays] = useState(30);
	const [sort, setSort] = useState<'recent' | 'count'>('recent');
	const [keyword, setKeyword] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [usage, setUsage] = useState<MilestoneUsageResult>();
	const [usageLoading, setUsageLoading] = useState(false);

	useEffect(() => {
		apiGet<MilestoneMetrics>('/stats/milestones', { days }).then(setMetrics);
	}, [days]);

	const loadUsage = useCallback(
		async (nextPage: number, nextPageSize: number, nextKeyword: string, nextSort: string) => {
			setUsageLoading(true);
			try {
				const data = await apiGet<MilestoneUsageResult>('/milestones/usage', {
					page: nextPage,
					pageSize: nextPageSize,
					keyword: nextKeyword || undefined,
					sort: nextSort,
				});
				setUsage(data);
			} finally {
				setUsageLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		loadUsage(page, pageSize, keyword, sort);
	}, [loadUsage, page, pageSize, keyword, sort]);

	const total = metrics?.total ?? 0;
	const weekNew = metrics?.weekNew ?? 0;
	const monthNew = metrics?.monthNew ?? 0;
	const users = metrics?.users ?? 0;
	const babies = metrics?.babies ?? 0;
	const users7 = metrics?.users7 ?? 0;
	const users30 = metrics?.users30 ?? 0;
	const todayCount = metrics?.today ?? 0;
	const totalUsers = metrics?.totalUsers ?? 0;
	const totalBabies = metrics?.totalBabies ?? 0;

	const trendOption = {
		tooltip: { trigger: 'axis' },
		legend: { data: ['打卡数', '打卡人数'] },
		grid: { left: 48, right: 24, top: 44, bottom: 32 },
		xAxis: {
			type: 'category',
			data: (metrics?.daily ?? []).map((item) => item.date.slice(5)),
		},
		yAxis: { type: 'value', minInterval: 1 },
		series: [
			{
				name: '打卡数',
				type: 'bar',
				barMaxWidth: 16,
				itemStyle: { color: '#ff85c0' },
				data: (metrics?.daily ?? []).map((item) => item.count),
			},
			{
				name: '打卡人数',
				type: 'line',
				smooth: true,
				itemStyle: { color: '#69b1ff' },
				data: (metrics?.daily ?? []).map((item) => item.users),
			},
		],
	};

	const categoryData = (metrics?.categories ?? []).map((item) => ({
		name: MILESTONE_CATEGORY_LABELS[item.key] || item.key,
		value: item.count,
	}));

	const categoryOption = {
		tooltip: { trigger: 'item', formatter: '{b}: {c} 条（{d}%）' },
		legend: { bottom: 0, itemWidth: 10, itemHeight: 10 },
		series: [
			{
				type: 'pie',
				radius: ['38%', '64%'],
				center: ['50%', '44%'],
				itemStyle: { borderColor: '#fff', borderWidth: 2 },
				label: { formatter: '{b}\n{c}' },
				data: categoryData,
			},
		],
	};

	const usageColumns: ColumnsType<MilestoneUsageUser> = [
		{
			title: '用户',
			dataIndex: 'nickname',
			width: 190,
			render: (_value, row) => (
				<div>
					<div>{row.nickname || '已注销用户'}</div>
					{row.openId && (
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							OpenID {row.openId}
						</Typography.Text>
					)}
				</div>
			),
		},
		{
			title: '打卡宝宝',
			dataIndex: 'babies',
			render: (_value, row) => (
				<span>
					{row.babies.map((baby) => (
						<Tag key={baby.id} style={{ marginBottom: 4 }}>
							<Link to={`/babies/${baby.id}`}>{baby.name || '未命名宝宝'}</Link>
							<span style={{ opacity: 0.55 }}> ×{baby.count}</span>
						</Tag>
					))}
				</span>
			),
		},
		{
			title: '打卡数',
			dataIndex: 'count',
			width: 90,
			align: 'right',
		},
		{
			title: '自定义',
			dataIndex: 'customCount',
			width: 90,
			align: 'right',
		},
		{
			title: '首次打卡',
			dataIndex: 'firstAt',
			width: 170,
			render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
		},
		{
			title: '最近打卡',
			dataIndex: 'lastAt',
			width: 170,
			render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
		},
	];

	return (
		<div>
			<Card title="成长里程碑" className="chart-card" style={{ marginBottom: 16 }}>
				<Typography.Paragraph type="secondary">
					看看这个功能有没有人用、用得多不多、谁在用。打卡数据来自里程碑打卡表，
					页面访问 / 海报分享 / 删除来自埋点；埋点从功能上线后开始累计，历史打卡仍计入总量。
				</Typography.Paragraph>
				<Row gutter={[16, 16]}>
					<Col xs={24} sm={12} xl={6}>
						<Statistic title="累计打卡" value={total} suffix=" 条" />
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							近 7 天 +{weekNew} · 近 30 天 +{monthNew}
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic title="使用人数" value={users} suffix=" 人" />
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							覆盖 {metrics?.userCoverageRate ?? 0}% 注册用户（{users}/{totalUsers}）
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic title="使用宝宝" value={babies} suffix=" 个" />
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							覆盖 {metrics?.babyCoverageRate ?? 0}% 宝宝（{babies}/{totalBabies}）
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic title="近 7 天打卡用户" value={users7} suffix=" 人" />
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							近 30 天 {users30} 人 · 今日 +{todayCount}
						</Typography.Text>
					</Col>
				</Row>
				<Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
					人均打卡 {metrics?.avgPerBaby ?? 0} 条/宝宝 · 自定义占比 {metrics?.customRate ?? 0}% ·
					配图率 {metrics?.photoRate ?? 0}% · 已注销用户留下的打卡 {metrics?.deletedActorCount ?? 0} 条
				</Typography.Paragraph>
			</Card>

			<Card
				title="打卡趋势"
				className="chart-card"
				style={{ marginBottom: 16 }}
				extra={
					<Segmented
						options={DAYS_OPTIONS}
						value={days}
						onChange={(value) => setDays(value as number)}
					/>
				}
			>
				<ReactECharts option={trendOption} style={{ height: 300 }} notMerge />
			</Card>

			<Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
				<Col xs={24} lg={10}>
					<Card title="分类分布" className="chart-card" style={{ height: '100%' }}>
						{categoryData.length > 0 ? (
							<ReactECharts option={categoryOption} style={{ height: 300 }} notMerge />
						) : (
							<Empty description="暂无打卡数据" />
						)}
					</Card>
				</Col>
				<Col xs={24} lg={14}>
					<Card title="热门里程碑" className="chart-card" style={{ height: '100%' }}>
						<Table
							size="small"
							rowKey="code"
							dataSource={metrics?.top ?? []}
							columns={[
								{ title: '里程碑', dataIndex: 'title' },
								{ title: '打卡数', dataIndex: 'count', width: 90, align: 'right' },
								{ title: '使用人数', dataIndex: 'users', width: 100, align: 'right' },
								{
									title: '配图率',
									dataIndex: 'photoCount',
									width: 90,
									align: 'right',
									render: (value: number, row) => `${pct(value, row.count)}%`,
								},
							]}
							locale={{ emptyText: '暂无打卡数据' }}
							pagination={false}
						/>
					</Card>
				</Col>
			</Row>

			<Card title="行为漏斗（近 7 天）" className="chart-card" style={{ marginBottom: 16 }}>
				<Row gutter={[16, 16]}>
					<Col xs={24} sm={12} xl={6}>
						<Statistic
							title="页面访问用户"
							value={metrics?.funnel.viewUsers7 ?? 0}
							suffix=" 人"
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							共访问 {metrics?.funnel.views7 ?? 0} 次
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic
							title="打卡用户"
							value={metrics?.funnel.checkInUsers7 ?? 0}
							suffix=" 人"
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							新增 {metrics?.funnel.checkIns7 ?? 0} 条 · 访问转打卡{' '}
							{metrics?.funnel.conversionRate7 ?? 0}%
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic
							title="海报分享"
							value={metrics?.funnel.posterShares7 ?? 0}
							suffix=" 次"
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{metrics?.funnel.posterUsers7 ?? 0} 人分享过
						</Typography.Text>
					</Col>
					<Col xs={24} sm={12} xl={6}>
						<Statistic
							title="删除里程碑"
							value={metrics?.funnel.deletes7 ?? 0}
							suffix=" 次"
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							仅统计近 7 天
						</Typography.Text>
					</Col>
				</Row>
			</Card>

			<Card title="使用用户" className="chart-card">
				<Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
					<Col flex="320px">
						<Input.Search
							allowClear
							placeholder="搜索用户昵称 / 宝宝名"
							onSearch={(value) => {
								setKeyword(value.trim());
								setPage(1);
							}}
						/>
					</Col>
					<Col>
						<Segmented
							options={SORT_OPTIONS}
							value={sort}
							onChange={(value) => {
								setSort(value as 'recent' | 'count');
								setPage(1);
							}}
						/>
					</Col>
				</Row>
				<Table
					size="small"
					rowKey={(row) => row.userId || 'deleted'}
					loading={usageLoading}
					dataSource={usage?.list ?? []}
					columns={usageColumns}
					locale={{ emptyText: '暂无打卡用户' }}
					pagination={{
						current: usage?.page ?? page,
						pageSize: usage?.pageSize ?? pageSize,
						total: usage?.total ?? 0,
						showSizeChanger: true,
						showTotal: (value) => `共 ${value} 位打卡用户`,
						onChange: (nextPage, nextPageSize) => {
							if (nextPageSize !== pageSize) {
								setPageSize(nextPageSize);
								setPage(1);
							} else {
								setPage(nextPage);
							}
						},
					}}
				/>
				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					按实际打卡人聚合（家人代记算在打卡人名下）；已注销用户会单独显示。
				</Typography.Text>
			</Card>
		</div>
	);
}
