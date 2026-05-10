import { create } from 'zustand';
import { babyApi } from '../utils/request';

export interface Baby {
  id: string;
  name: string;
  gender: 'male' | 'female';
  birthday: string;
  avatar?: string;
  createdAt: string;
  isOwner?: boolean;
}

interface BabyState {
  babies: Baby[];
  currentBaby: Baby | null;
  loading: boolean;
  fetchBabies: () => Promise<void>;
  setCurrentBaby: (baby: Baby) => void;
  addBaby: (baby: { name: string; gender: 'male' | 'female'; birthday: string }) => Promise<void>;
  updateBaby: (id: string, data: Partial<Baby>) => Promise<void>;
  deleteBaby: (id: string) => Promise<void>;
}

export const useBabyStore = create<BabyState>((set, get) => ({
  babies: [],
  currentBaby: null,
  loading: false,

  fetchBabies: async () => {
    set({ loading: true });
    try {
      const res = await babyApi.getAll();
      const babies = res.data || [];
      const { currentBaby } = get();
      // 只有当前宝宝为空或不在列表中时才更新
      const newCurrentBaby = currentBaby && babies.find((b) => b.id === currentBaby.id)
        ? currentBaby
        : babies.length > 0
          ? babies[0]
          : null;
      set({
        babies,
        currentBaby: newCurrentBaby,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
    }
  },

  setCurrentBaby: (baby: Baby) => {
    set({ currentBaby: baby });
  },

  addBaby: async (babyData) => {
    const res = await babyApi.create(babyData);
    const newBaby = res.data;
    set((state) => ({
      babies: [newBaby, ...state.babies],
      currentBaby: state.babies.length === 0 ? newBaby : state.currentBaby,
    }));
  },

  updateBaby: async (id, data) => {
    const res = await babyApi.update(id, data);
    const updatedBaby = res.data;
    set((state) => ({
      babies: state.babies.map((b) => (b.id === id ? updatedBaby : b)),
      currentBaby: state.currentBaby?.id === id ? updatedBaby : state.currentBaby,
    }));
  },

  deleteBaby: async (id) => {
    await babyApi.delete(id);
    set((state) => {
      const babies = state.babies.filter((b) => b.id !== id);
      return {
        babies,
        currentBaby: state.currentBaby?.id === id ? babies[0] || null : state.currentBaby,
      };
    });
  },
}));
