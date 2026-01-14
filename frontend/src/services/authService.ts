import api from './api';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  avatar?: string;
  status: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
}

export const authService = {
  login: async (credentials: LoginCredentials) => {
    const response = await api.post<any>('/auth/login', credentials);
    return response.data; // 经过拦截器处理，response.data 已经是嵌套后的 data 部分
  },

  register: async (data: RegisterData) => {
    const response = await api.post<any>('/auth/register', data);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get<any>('/auth/profile');
    return response.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const response = await api.put<any>('/auth/profile', data);
    return response.data;
  },

  logout: async () => {
    const response = await api.post<any>('/auth/logout');
    return response.data;
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<any>('/auth/upload-avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
};
