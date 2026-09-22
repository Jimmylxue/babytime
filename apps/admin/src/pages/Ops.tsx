import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiGet } from '../api/client';
import type { OpsEndpointStatus, OpsHttpsStatus } from '../types';

/** 剩 30 天内黄、14 天内红：acme.sh 与又拍云都在剩 30 天前触发续签，
 *  真到了 14 天内说明那套自动化已经没干活，必须人工介入 */
const WARN_DAYS = 30;
const DANGER_DAYS = 14;

function issuerCn(issuer: string) {
	// Node 的 X509Certificate.issuer 是换行分隔的 DN，不是逗号
	const matched = /CN=([^,\n]+)/.exec(issuer);
	return matched ? matched[1].trim() : issuer.replace(/\n/g, ', ') || '—';
}

function fmtDate(iso: string | null) {
	if (!iso) return '—';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate(),
	).padStart(2, '0')}`;
}

function statusOf(item: OpsEndpointStatus) {
	if (!item.reachable) return { color: 'red', text: '握手失败' };
	if (!item.trusted) return { color: 'red', text: '证书链异常' };
	if (item.daysLeft === null) return { color: 'default', text: '未知' };
	if (item.daysLeft < 0) return { color: 'red', text: '已过期' };
	if (item.daysLeft < DANGER_DAYS) return { color: 'red', text: '即将到期' };
	if (item.daysLeft < WARN_DAYS) return { color: 'orange', text: '留意' };
	return { color: 'green', text: '正常' };
}

export default function Ops() {
	const [data, setData] = useState<OpsHttpsStatus>();
	const [loading, setLoading] = useState(false);

	const load = useCallback(async (force = false) => {
		setLoading(true);
		try {
			setData(await apiGet<OpsHttpsStatus>('/ops/https', force ? { refresh: 1 } : undefined));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const endpoints = data?.endpoints ?? [];
	const failing = endpoints.filter((item) => !item.reachable || !item.trusted || (item.daysLeft ?? 99) < DANGER_DAYS);
	const soonest = endpoints
		.filter((item) => item.daysLeft !== null)
		.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
	const domainDaysLeft = data?.domain?.daysLeft ?? null;

	return (
		<div>
			<Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
				<Col xs={24} md={8}>
					<Card className="dashboard-kpi" bordered={false}>
						<Statistic
							title="域名注册到期"
							value={domainDaysLeft ?? '未配置'}
							suffix={domainDaysLeft === null ? '' : ' 天'}
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{domainDaysLeft === null
								? '未配置 OPS_DOMAIN_EXPIRY，续费后在 .env 填上到期日'
								: `${data?.domain.name} · ${fmtDate(data?.domain.expiresAt ?? null)}`}
						</Typography.Text>
					</Card>
				</Col>
				<Col xs={24} md={8}>
					<Card className="dashboard-kpi" bordered={false}>
						<Statistic
							title="最早的证书到期"
							value={soonest?.daysLeft ?? '—'}
							suffix={soonest ? ' 天' : ''}
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{soonest ? `${soonest.host} · ${fmtDate(soonest.validTo)}` : '暂无数据'}
						</Typography.Text>
					</Card>
				</Col>
				<Col xs={24} md={8}>
					<Card className="dashboard-kpi" bordered={false}>
						<Statistic
							title="需要处理的端点"
							value={failing.length}
							suffix=" 个"
							valueStyle={failing.length ? { color: '#cf1322' } : undefined}
						/>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{failing.length ? failing.map((item) => item.host.split('.')[0]).join('、') : '全部端点握手正常'}
						</Typography.Text>
					</Card>
				</Col>
			</Row>

			<Card
				title="HTTPS 证书"
				className="chart-card"
				extra={
					<Space>
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{data ? `探测于 ${new Date(data.checkedAt).toLocaleTimeString('zh-CN')}` : ''}
						</Typography.Text>
						<Button icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>
							重新探测
						</Button>
					</Space>
				}
			>
				<Typography.Paragraph type="secondary">
					这里显示的是服务端当场与线上握手拿到的真实证书，不是配置文件里声称的状态——acme.sh、又拍云两套自动续签都可能静默失败，
					只有从外部探测能发现。剩 30 天内标黄、14 天内标红（两套自动化都应在剩 30 天前就完成续签）。
					处置方式见 <code>docs/ops-runbook.md</code> 第七节。
				</Typography.Paragraph>
				<Table<OpsEndpointStatus>
					rowKey="host"
					loading={loading && !data}
					dataSource={endpoints}
					pagination={false}
					size="middle"
					columns={[
						{
							title: '域名',
							dataIndex: 'host',
							render: (host: string, item) => (
								<Tooltip title={item.error || undefined}>
									<span>{host.replace('.jimmyxuexue.top', '')}</span>
								</Tooltip>
							),
						},
						{ title: '用途', dataIndex: 'purpose' },
						{ title: '证书来源', dataIndex: 'managedBy' },
						{
							title: '颁发者',
							dataIndex: 'issuer',
							render: (issuer: string) => <Tooltip title={issuer}>{issuerCn(issuer)}</Tooltip>,
						},
						{
							title: '到期',
							dataIndex: 'validTo',
							render: (validTo: string) => fmtDate(validTo),
						},
						{
							title: '剩余',
							dataIndex: 'daysLeft',
							sorter: (a, b) => (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999),
							render: (daysLeft: number | null) => (daysLeft === null ? '—' : `${daysLeft} 天`),
						},
						{
							title: '状态',
							key: 'status',
							render: (_, item) => {
								const { color, text } = statusOf(item);
								const tag = <Tag color={color}>{text}</Tag>;
								return item.error ? <Tooltip title={item.error}>{tag}</Tooltip> : tag;
							},
						},
					]}
				/>
			</Card>
		</div>
	);
}
