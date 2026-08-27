import { Button, Card, Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client';
import { setAuth } from '../auth';

interface LoginForm {
	username: string;
	password: string;
}

export default function Login() {
	const navigate = useNavigate();
	const [form] = Form.useForm<LoginForm>();

	const handleSubmit = async (values: LoginForm) => {
		try {
			const data = await apiPost<{ accessToken: string; username: string }>('/auth/login', values);
			setAuth(data.accessToken, data.username);
			navigate('/', { replace: true });
		} catch (e: any) {
			message.error(e.message || '登录失败');
		}
	};

	return (
		<div
			style={{
				height: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'linear-gradient(135deg, #1677ff15, #f0f2f5)',
			}}
		>
			<Card style={{ width: 380 }} title="育娃手记 · 管理后台">
				<Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
					<Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
						<Input placeholder="请输入账号" autoFocus />
					</Form.Item>
					<Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
						<Input.Password placeholder="请输入密码" />
					</Form.Item>
					<Button type="primary" htmlType="submit" block>
						登录
					</Button>
				</Form>
			</Card>
		</div>
	);
}
