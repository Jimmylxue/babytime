import { Layout, Menu, Button, Space, Typography } from 'antd';
import {
	DashboardOutlined,
	SmileOutlined,
	TeamOutlined,
	BarChartOutlined,
	NotificationOutlined,
	LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, getUsername } from '../auth';

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
	{ key: '/', icon: <DashboardOutlined />, label: '数据看板' },
	{ key: '/babies', icon: <SmileOutlined />, label: '宝宝列表' },
	{ key: '/users', icon: <TeamOutlined />, label: '用户列表' },
	{ key: '/analytics', icon: <BarChartOutlined />, label: '数据分析' },
	{ key: '/announcements', icon: <NotificationOutlined />, label: '公告管理' },
];

export default function AdminLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const username = getUsername();
	// 宝宝详情页路径为 /babies/:id，高亮仍落在「宝宝列表」菜单上
	const selectedKey = location.pathname.startsWith('/babies') ? '/babies' : location.pathname;

	const handleLogout = () => {
		clearAuth();
		navigate('/login', { replace: true });
	};

	return (
		<Layout style={{ minHeight: '100vh' }}>
			<Sider className="admin-sider" theme="dark" width={200}>
				<div className="admin-logo">育娃手记 · 后台</div>
				<Menu
					theme="dark"
					mode="inline"
					selectedKeys={[selectedKey]}
					items={MENU_ITEMS}
					onClick={({ key }) => navigate(key)}
				/>
			</Sider>
			<Layout>
				<Header
					style={{
						background: '#fff',
						padding: '0 24px',
						display: 'flex',
						justifyContent: 'flex-end',
						alignItems: 'center',
					}}
				>
					<Space>
						<Typography.Text type="secondary">管理员：{username}</Typography.Text>
						<Button icon={<LogoutOutlined />} onClick={handleLogout}>
							退出登录
						</Button>
					</Space>
				</Header>
				<Content style={{ margin: 24 }}>
					<Outlet />
				</Content>
			</Layout>
		</Layout>
	);
}
