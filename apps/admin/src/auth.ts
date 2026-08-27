export const TOKEN_KEY = 'baby-time-admin-token';
export const USERNAME_KEY = 'baby-time-admin-username';

export function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token: string, username: string) {
	localStorage.setItem(TOKEN_KEY, token);
	localStorage.setItem(USERNAME_KEY, username);
}

export function getUsername(): string | null {
	return localStorage.getItem(USERNAME_KEY);
}

export function clearAuth() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(USERNAME_KEY);
}
