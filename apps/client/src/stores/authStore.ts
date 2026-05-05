import { create } from 'zustand';
import Taro from '@tarojs/taro';

interface UserInfo {
  id: string;
  nickname: string;
  avatar?: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  userInfo: UserInfo | null;
  isLoggedIn: boolean;
  setToken: (token: string) => void;
  setUserInfo: (userInfo: UserInfo) => void;
  logout: () => void;
  checkLogin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: Taro.getStorageSync('token') || null,
  userInfo: Taro.getStorageSync('userInfo') || null,
  isLoggedIn: !!Taro.getStorageSync('token'),

  setToken: (token: string) => {
    Taro.setStorageSync('token', token);
    set({ token, isLoggedIn: true });
  },

  setUserInfo: (userInfo: UserInfo) => {
    Taro.setStorageSync('userInfo', userInfo);
    set({ userInfo });
  },

  logout: () => {
    Taro.removeStorageSync('token');
    Taro.removeStorageSync('userInfo');
    set({ token: null, userInfo: null, isLoggedIn: false });
  },

  checkLogin: () => {
    const { token } = get();
    return !!token;
  },
}));
