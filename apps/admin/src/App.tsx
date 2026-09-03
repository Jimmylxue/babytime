import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './auth';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Babies from './pages/Babies';
import BabyDetailPage from './pages/BabyDetail';
import Analytics from './pages/Analytics';
import Announcements from './pages/Announcements';
import Subscriptions from './pages/Subscriptions';

function RequireAuth({ children }: { children: JSX.Element }) {
	if (!getToken()) {
		return <Navigate to="/login" replace />;
	}
	return children;
}

export default function App() {
	return (
		<Routes>
			<Route path="/login" element={<Login />} />
			<Route
				path="/"
				element={
					<RequireAuth>
						<AdminLayout />
					</RequireAuth>
				}
			>
				<Route index element={<Dashboard />} />
				<Route path="babies" element={<Babies />} />
				<Route path="babies/:id" element={<BabyDetailPage />} />
				<Route path="users" element={<Users />} />
				<Route path="analytics" element={<Analytics />} />
				<Route path="announcements" element={<Announcements />} />
				<Route path="notifications" element={<Subscriptions />} />
			</Route>
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}
