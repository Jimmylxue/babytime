import { useCallback, useEffect, useState } from 'react';
import {
	Avatar,
	Button,
	Card,
	Drawer,
	Image,
	List,
	Popconfirm,
	Segmented,
	Space,
	Spin,
	Table,
	Tabs,
	Tag,
	Typography,
	message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiGet, apiPost } from '../api/client';
import type {
	CommunityPhoto,
	CommunityPost,
	CommunityPostList,
	CommunityReport,
	CommunityReportList,
	CommunityReportTarget,
	CommunityInteractionComment,
	CommunityInteractions,
} from '../types';

const REASON_LABELS: Record<string, string> = {
	spam: '垃圾广告',
	abuse: '不友善内容',
	privacy: '侵犯隐私',
	other: '其他',
};

const REPORT_STATUS_OPTIONS = [
	{ label: '待处理', value: 'pending' },
	{ label: '已处理', value: 'handled' },
	{ label: '已忽略', value: 'dismissed' },
	{ label: '全部', value: 'all' },
];

function photoStrip(photos: CommunityPhoto[]) {
	if (photos.length === 0) return <Typography.Text type="secondary">无图片</Typography.Text>;
	return (
		<Image.PreviewGroup>
			<Space size={4} wrap>
				{photos.map((photo) => (
					<Image
						key={photo.id}
						src={photo.thumbnail || photo.url}
						width={40}
						height={40}
						style={{ objectFit: 'cover', borderRadius: 6 }}
					/>
				))}
			</Space>
		</Image.PreviewGroup>
	);
}

function targetPreview(target: CommunityReportTarget) {
	if (!target) return <Typography.Text type="secondary">内容已删除</Typography.Text>;
	if (target.type === 'moment') {
		return (
			<Space direction="vertical" size={4}>
				<Typography.Text ellipsis={{ tooltip: target.content || '（无文案）' }}>
					{target.content || '（无文案）'}
				</Typography.Text>
				{photoStrip(target.photos)}
			</Space>
		);
	}
	return (
		<Space direction="vertical" size={4}>
			<Typography.Text ellipsis={{ tooltip: target.content }}>
				评论：{target.content}
			</Typography.Text>
			{target.moment && (
				<Typography.Text type="secondary" ellipsis={{ tooltip: target.moment.content || '（无文案）' }}>
					所属瞬间：{target.moment.content || '（无文案）'}
				</Typography.Text>
			)}
			{target.moment && photoStrip(target.moment.photos)}
		</Space>
	);
}

function AdminCommentTree({ comments }: { comments: CommunityInteractionComment[] }) {
	if (comments.length === 0) {
		return <Typography.Text type="secondary">暂无评论</Typography.Text>;
	}
	return (
		<Space direction="vertical" size={14} style={{ width: '100%' }}>
			{comments.map((comment) => (
				<div key={comment.id}>
					<Space size={6} align="center" wrap>
						<Avatar size="small" src={comment.author.avatar || undefined}>
							{comment.author.nickname.slice(0, 1)}
						</Avatar>
						<Typography.Text strong>{comment.author.nickname}</Typography.Text>
						{comment.status === 'hidden' && <Tag>已隐藏</Tag>}
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{dayjs(comment.createdAt).format('MM-DD HH:mm')}
						</Typography.Text>
					</Space>
					<Typography.Paragraph style={{ margin: '4px 0 0 32px' }}>
						{comment.content}
					</Typography.Paragraph>
					{(comment.replies || []).map((reply) => (
						<div
							key={reply.id}
							style={{
								margin: '6px 0 0 32px',
								padding: '6px 8px',
								background: '#faf7f5',
								borderRadius: 6,
							}}
						>
							<Space size={6} align="center" wrap>
								<Typography.Text strong style={{ fontSize: 12 }}>
									{reply.author.nickname}
								</Typography.Text>
								{reply.replyToNickname && (
									<Typography.Text type="secondary" style={{ fontSize: 12 }}>
										回复 @{reply.replyToNickname}
									</Typography.Text>
								)}
								{reply.status === 'hidden' && <Tag>已隐藏</Tag>}
							</Space>
							<Typography.Paragraph style={{ margin: '2px 0 0' }}>
								{reply.content}
							</Typography.Paragraph>
						</div>
					))}
				</div>
			))}
		</Space>
	);
}

export default function Community() {
	const [tab, setTab] = useState('posts');
	const [posts, setPosts] = useState<CommunityPost[]>([]);
	const [postTotal, setPostTotal] = useState(0);
	const [postPage, setPostPage] = useState(1);
	const [postPageSize, setPostPageSize] = useState(20);
	const [postLoading, setPostLoading] = useState(false);
	const [reports, setReports] = useState<CommunityReport[]>([]);
	const [reportTotal, setReportTotal] = useState(0);
	const [reportPage, setReportPage] = useState(1);
	const [reportPageSize, setReportPageSize] = useState(20);
	const [reportStatus, setReportStatus] = useState('pending');
	const [reportLoading, setReportLoading] = useState(false);
	const [actingId, setActingId] = useState<string | null>(null);
	const [interactionOpen, setInteractionOpen] = useState(false);
	const [interactionTab, setInteractionTab] = useState('likes');
	const [interactions, setInteractions] = useState<CommunityInteractions>();
	const [interactionsLoading, setInteractionsLoading] = useState(false);

	const loadPosts = useCallback(async (page: number, pageSize: number) => {
		setPostLoading(true);
		try {
			const data = await apiGet<CommunityPostList>('/community/posts', {
				page,
				pageSize,
			});
			setPosts(data.list);
			setPostTotal(data.total);
			setPostPage(data.page);
			setPostPageSize(data.pageSize);
		} finally {
			setPostLoading(false);
		}
	}, []);

	const loadReports = useCallback(
		async (page: number, pageSize: number, status: string) => {
			setReportLoading(true);
			try {
				const data = await apiGet<CommunityReportList>('/community/reports', {
					page,
					pageSize,
					status,
				});
				setReports(data.list);
				setReportTotal(data.total);
				setReportPage(data.page);
				setReportPageSize(data.pageSize);
			} finally {
				setReportLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		loadPosts(1, postPageSize);
	}, [loadPosts, postPageSize]);

	useEffect(() => {
		loadReports(1, reportPageSize, reportStatus);
	}, [loadReports, reportPageSize, reportStatus]);

	const hidePost = async (id: string) => {
		setActingId(id);
		try {
			await apiPost(`/community/posts/${id}/hide`);
			message.success('已下架，该瞬间不再出现在育娃圈');
			loadPosts(postPage, postPageSize);
			if (tab === 'reports') loadReports(reportPage, reportPageSize, reportStatus);
		} catch (error) {
			message.error((error as Error).message || '操作失败');
		} finally {
			setActingId(null);
		}
	};

	const handleReport = async (id: string, action: 'hide' | 'dismiss') => {
		setActingId(id);
		try {
			await apiPost(`/community/reports/${id}/handle`, { action });
			message.success(action === 'hide' ? '内容已下架' : '已忽略举报');
			loadReports(reportPage, reportPageSize, reportStatus);
			loadPosts(postPage, postPageSize);
		} catch (error) {
			message.error((error as Error).message || '操作失败');
		} finally {
			setActingId(null);
		}
	};

	const openInteractions = async (postId: string, tab: 'likes' | 'comments') => {
		setInteractionOpen(true);
		setInteractionTab(tab);
		setInteractions(undefined);
		setInteractionsLoading(true);
		try {
			const data = await apiGet<CommunityInteractions>(
				`/community/posts/${postId}/interactions`,
			);
			setInteractions(data);
		} finally {
			setInteractionsLoading(false);
		}
	};

	const interactionCommentTotal = (interactions?.comments ?? []).reduce(
		(total, comment) => total + 1 + (comment.replies?.length ?? 0),
		0,
	);

	const postColumns: ColumnsType<CommunityPost> = [
		{
			title: '内容',
			dataIndex: 'content',
			render: (_value, row) => (
				<Typography.Paragraph
					ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
					style={{ marginBottom: 0, maxWidth: 380 }}
				>
					{row.content || '（无文案）'}
				</Typography.Paragraph>
			),
		},
		{
			title: '图片',
			dataIndex: 'photos',
			width: 180,
			render: (_value, row) => photoStrip(row.photos),
		},
		{
			title: '作者',
			dataIndex: 'author',
			width: 130,
			render: (_value, row) => (
				<Space>
					{row.author.avatar && (
						<Image
							src={row.author.avatar}
							width={28}
							height={28}
							style={{ objectFit: 'cover', borderRadius: '50%' }}
							preview={false}
						/>
					)}
					<Typography.Text>{row.author.nickname}</Typography.Text>
				</Space>
			),
		},
		{ title: '点赞', dataIndex: 'likeCount', width: 70, align: 'right', render: (value: number, row) => (
			<Button type="link" size="small" style={{ padding: 0 }} onClick={() => openInteractions(row.id, 'likes')}>
				{value}
			</Button>
		) },
		{ title: '评论', dataIndex: 'commentCount', width: 70, align: 'right', render: (value: number, row) => (
			<Button type="link" size="small" style={{ padding: 0 }} onClick={() => openInteractions(row.id, 'comments')}>
				{value}
			</Button>
		) },
		{
			title: '发布时间',
			dataIndex: 'createdAt',
			width: 160,
			render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
		},
		{
			title: '操作',
			width: 100,
			render: (_value, row) => (
				<Popconfirm
					title="从育娃圈下架这条瞬间？"
					description="家庭相册里的内容不会删除"
					onConfirm={() => hidePost(row.id)}
					okText="下架"
					cancelText="取消"
				>
					<Button danger size="small" loading={actingId === row.id}>
						下架
					</Button>
				</Popconfirm>
			),
		},
	];

	const reportColumns: ColumnsType<CommunityReport> = [
		{
			title: '举报原因',
			dataIndex: 'reason',
			width: 160,
			render: (value: string, row) => (
				<Space direction="vertical" size={2}>
					<Tag color="red">{REASON_LABELS[value] || value}</Tag>
					{row.detail && (
						<Typography.Text type="secondary" style={{ fontSize: 12 }}>
							{row.detail}
						</Typography.Text>
					)}
				</Space>
			),
		},
		{
			title: '被举报内容',
			dataIndex: 'target',
			render: (_value, row) => targetPreview(row.target),
		},
		{
			title: '举报人',
			dataIndex: 'reporter',
			width: 120,
			render: (_value, row) => row.reporter.nickname,
		},
		{
			title: '举报时间',
			dataIndex: 'createdAt',
			width: 160,
			render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
		},
		{
			title: '状态',
			dataIndex: 'status',
			width: 90,
			render: (value: string) =>
				value === 'pending' ? (
					<Tag color="orange">待处理</Tag>
				) : value === 'handled' ? (
					<Tag color="green">已处理</Tag>
				) : (
					<Tag>已忽略</Tag>
				),
		},
		{
			title: '操作',
			width: 180,
			render: (_value, row) => (
				<Space>
					<Popconfirm
						title="下架被举报内容？"
						onConfirm={() => handleReport(row.id, 'hide')}
						okText="下架"
						cancelText="取消"
					>
						<Button
							danger
							size="small"
							disabled={row.status !== 'pending'}
							loading={actingId === row.id}
						>
							下架内容
						</Button>
					</Popconfirm>
					<Button
						size="small"
						disabled={row.status !== 'pending'}
						onClick={() => handleReport(row.id, 'dismiss')}
					>
						忽略
					</Button>
				</Space>
			),
		},
	];

	return (
		<Card title="育娃圈" className="chart-card">
			<Typography.Paragraph type="secondary">
				管理公开到育娃圈的瞬间与用户举报。下架只把瞬间设为家庭可见或隐藏评论，不会删除家庭相册里的内容。
			</Typography.Paragraph>
			<Tabs
				activeKey={tab}
				onChange={setTab}
				items={[
					{
						key: 'posts',
						label: `公开瞬间（${postTotal}）`,
						children: (
							<Table
								size="small"
								rowKey="id"
								loading={postLoading}
								dataSource={posts}
								columns={postColumns}
								locale={{ emptyText: '暂无公开瞬间' }}
								pagination={{
									current: postPage,
									pageSize: postPageSize,
									total: postTotal,
									showSizeChanger: true,
									onChange: (page, pageSize) => {
										if (pageSize !== postPageSize) {
											setPostPageSize(pageSize);
										} else {
											setPostPage(page);
											loadPosts(page, pageSize);
										}
									},
								}}
							/>
						),
					},
					{
						key: 'reports',
						label: `举报处理（${reportTotal}）`,
						children: (
							<Space direction="vertical" size={12} style={{ width: '100%' }}>
								<Segmented
									options={REPORT_STATUS_OPTIONS}
									value={reportStatus}
									onChange={(value) => setReportStatus(value as string)}
								/>
								<Table
									size="small"
									rowKey="id"
									loading={reportLoading}
									dataSource={reports}
									columns={reportColumns}
									locale={{ emptyText: '暂无举报' }}
									pagination={{
										current: reportPage,
										pageSize: reportPageSize,
										total: reportTotal,
										showSizeChanger: true,
										onChange: (page, pageSize) => {
											if (pageSize !== reportPageSize) {
												setReportPageSize(pageSize);
											} else {
												setReportPage(page);
												loadReports(page, pageSize, reportStatus);
											}
										},
									}}
								/>
							</Space>
						),
					},
				]}
			/>

			<Drawer
				title="互动详情"
				width={480}
				open={interactionOpen}
				onClose={() => setInteractionOpen(false)}
			>
				<Spin spinning={interactionsLoading}>
					{interactions?.post && (
						<Typography.Paragraph
							type="secondary"
							ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
							style={{ marginBottom: 16 }}
						>
							{interactions.post.content || '（无文案）'}
						</Typography.Paragraph>
					)}
					<Tabs
						activeKey={interactionTab}
						onChange={setInteractionTab}
						items={[
							{
								key: 'likes',
								label: `点赞（${interactions?.likes.length ?? 0}）`,
								children: (
									<List
										dataSource={interactions?.likes ?? []}
										locale={{ emptyText: '暂无点赞' }}
										renderItem={(item) => (
											<List.Item>
												<List.Item.Meta
													avatar={
														<Avatar src={item.author.avatar || undefined}>
															{item.author.nickname.slice(0, 1)}
														</Avatar>
													}
													title={item.author.nickname}
													description={dayjs(item.createdAt).format(
														'YYYY-MM-DD HH:mm',
													)}
												/>
											</List.Item>
										)}
									/>
								),
							},
							{
								key: 'comments',
								label: `评论（${interactionCommentTotal}）`,
								children: (
									<AdminCommentTree comments={interactions?.comments ?? []} />
								),
							},
						]}
					/>
				</Spin>
			</Drawer>
		</Card>
	);
}
