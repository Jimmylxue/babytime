import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { apiGet } from '../api/client';
import type { ToolsMetrics } from '../types';

export default function MiniApps() {
	const [metrics, setMetrics] = useState<ToolsMetrics>();

	useEffect(() => {
		apiGet<ToolsMetrics>('/stats/tools').then(setMetrics);
	}, []);

	return (
		<div>
			<Card title="小应用使用情况" className="chart-card" style={{ marginBottom: 16 }}>
				<Typography.Paragraph type="secondary">
					应用 tab 里各小应用的使用率。使用率 = 近 7 天打开过任一小应用的用户 / 近 7 天活跃用户（活跃口径同数据看板：产生过记录的用户）。
				</Typography.Paragraph>
				<Row gutter={[16, 16]}>
					<Col xs={12} md={6}>
						<Statistic
							title="应用页访问（7天）"
							value={metrics?.hubViews7 ?? 0}
							suffix={` / ${metrics?.hubUsers7 ?? 0} 人`}
						/>
					</Col>
					<Col xs={12} md={6}>
						<Statistic
							title="小应用使用率（7天）"
							value={metrics?.usageRate ?? 0}
							suffix="%"
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{metrics?.toolUsers7 ?? 0} / {metrics?.activeUsers7 ?? 0} 人打开过小应用
						</Typography.Text>
					</Col>
					<Col xs={12} md={6}>
						<Statistic
							title="AI 便便识别发起（7天）"
							value={metrics?.stoolAnalyzes7 ?? 0}
							suffix={` / ${metrics?.stoolUsers7 ?? 0} 人`}
						/>
					</Col>
					<Col xs={12} md={6}>
						<Statistic title="小应用总数" value={(metrics?.apps ?? []).length} suffix=" 个" />
					</Col>
				</Row>
			</Card>

			<Card
				title="访问与打开趋势"
				className="chart-card"
				style={{ marginBottom: 16 }}
				extra={<Typography.Text type="secondary">近 14 天</Typography.Text>}
			>
				<ReactECharts
					option={{
						tooltip: { trigger: 'axis' },
						legend: { data: ['应用页访问', '小应用打开'] },
						grid: { left: 40, right: 16, top: 36, bottom: 28 },
						xAxis: {
							type: 'category',
							data: (metrics?.daily14 ?? []).map((d) => d.date.slice(5)),
						},
						yAxis: { type: 'value', minInterval: 1 },
						series: [
							{
								name: '应用页访问',
								type: 'line',
								smooth: true,
								data: (metrics?.daily14 ?? []).map((d) => d.hubViews),
								itemStyle: { color: '#ff85c0' },
							},
							{
								name: '小应用打开',
								type: 'bar',
								data: (metrics?.daily14 ?? []).map((d) => d.opens),
								itemStyle: { color: '#69b1ff' },
								barMaxWidth: 18,
							},
						],
					}}
					style={{ height: 260 }}
					notMerge
				/>
			</Card>

			<Card title="各小应用明细" className="chart-card">
				<Table
					size="small"
					rowKey="key"
					dataSource={metrics?.apps ?? []}
					columns={[
						{ title: '应用', dataIndex: 'label' },
						{ title: '点击（7天）', dataIndex: 'clicks7', width: 110 },
						{ title: '打开（7天）', dataIndex: 'opens7', width: 110 },
						{ title: '打开用户（7天）', dataIndex: 'openUsers7', width: 130 },
						{ title: '打开用户（30天）', dataIndex: 'users30', width: 130 },
						{
							title: '点击 → 打开率',
							dataIndex: 'openRate',
							width: 130,
							render: (value: number) => `${value}%`,
						},
					]}
					locale={{ emptyText: '暂无使用数据' }}
					pagination={false}
				/>
				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					埋点自新版客户端（含应用 tab）发布后开始累计，且仅统计已登录用户；新上架的小应用会自动出现在列表中。
				</Typography.Text>
			</Card>
		</div>
	);
}
