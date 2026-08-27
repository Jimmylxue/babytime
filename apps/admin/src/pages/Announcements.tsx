import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Space, Switch, Table, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiGet, apiPost, apiPut } from '../api/client';
import type { Announcement, AnnouncementPayload } from '../types';

interface FormValues {
	title: string;
	content: string;
	isActive: boolean;
}

export default function Announcements() {
	const [list, setList] = useState<Announcement[]>([]);
	const [loading, setLoading] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<Announcement>();
	const [submitting, setSubmitting] = useState(false);
	const [form] = Form.useForm<FormValues>();

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<Announcement[]>('/announcements');
			setList(data);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const openCreate = () => {
		setEditing(undefined);
		form.setFieldsValue({ title: '', content: '', isActive: true });
		setModalOpen(true);
	};

	const openEdit = (record: Announcement) => {
		setEditing(record);
		form.setFieldsValue({ title: record.title, content: record.content, isActive: record.isActive });
		setModalOpen(true);
	};

	const handleSubmit = async (values: FormValues) => {
		setSubmitting(true);
		try {
			const payload: AnnouncementPayload = {
				title: values.title,
				content: values.content,
				isActive: values.isActive,
			};
			if (editing) {
				await apiPut(`/announcements/${editing.id}`, payload);
				message.success('公告已更新');
			} else {
				await apiPost('/announcements', payload);
				message.success('公告已发布');
			}
			setModalOpen(false);
			load();
		} catch (e: any) {
			message.error(e.message || '保存失败');
		} finally {
			setSubmitting(false);
		}
	};

	const toggleActive = async (record: Announcement, isActive: boolean) => {
		try {
			await apiPut(`/announcements/${record.id}`, { isActive });
			load();
		} catch (e: any) {
			message.error(e.message || '操作失败');
		}
	};

	const columns = [
		{ title: '公告 ID', dataIndex: 'id', width: 260, ellipsis: true },
		{ title: '标题', dataIndex: 'title', width: 220, ellipsis: true },
		{
			title: '是否启用',
			dataIndex: 'isActive',
			width: 100,
			render: (_: boolean, record: Announcement) => (
				<Switch checked={record.isActive} onChange={(checked) => toggleActive(record, checked)} />
			),
		},
		{
			title: '发布时间',
			dataIndex: 'publishedAt',
			width: 170,
			render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
		},
		{
			title: '操作',
			key: 'actions',
			width: 100,
			render: (_: unknown, record: Announcement) => (
				<Popconfirm
					title="编辑内容不会让已读用户重新收到提示，如需全量重新触达，请新建公告。确定要编辑吗？"
					okText="编辑"
					cancelText="取消"
					onConfirm={() => openEdit(record)}
				>
					<Button type="link" size="small">
						编辑
					</Button>
				</Popconfirm>
			),
		},
	];

	return (
		<Card
			title="公告管理"
			extra={
				<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
					新建公告
				</Button>
			}
		>
			<Alert
				style={{ marginBottom: 16 }}
				type="info"
				showIcon
				message="客户端只展示最新一条「已启用」的公告；公告 ID 是用户已读状态的版本号，新建公告会自动生成新 ID。"
			/>
			<Table rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false} />

			<Modal
				title={editing ? '编辑公告' : '新建公告'}
				open={modalOpen}
				onCancel={() => setModalOpen(false)}
				onOk={() => form.submit()}
				confirmLoading={submitting}
				okText={editing ? '保存' : '发布'}
				cancelText="取消"
				destroyOnClose
			>
				<Form form={form} layout="vertical" onFinish={handleSubmit}>
					<Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }, { max: 40, message: '标题不能超过 40 字' }]}>
						<Input placeholder="公告标题" maxLength={40} showCount />
					</Form.Item>
					<Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
						<Input.TextArea placeholder="公告正文" rows={6} maxLength={5000} showCount />
					</Form.Item>
					<Form.Item name="isActive" label="立即启用" valuePropName="checked" initialValue={true}>
						<Switch />
					</Form.Item>
				</Form>
			</Modal>
		</Card>
	);
}
