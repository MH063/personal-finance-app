import api from './api';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
  parentId?: string;
  isSystem?: boolean;
}

const categoryService = {
  /**
   * 获取所有分类
   */
  getCategories: async (type?: 'income' | 'expense') => {
    const response = await api.get<any>('/categories', { params: { type } });
    return response.data;
  },

  /**
   * 获取单个分类
   */
  getCategory: async (id: string) => {
    const response = await api.get<any>(`/categories/${id}`);
    return response.data;
  },

  /**
   * 创建分类
   */
  createCategory: async (data: Partial<Category>) => {
    const response = await api.post<any>('/categories', data);
    return response.data;
  },

  /**
   * 更新分类
   */
  updateCategory: async (id: string, data: Partial<Category>) => {
    const response = await api.put<any>(`/categories/${id}`, data);
    return response.data;
  },

  /**
   * 删除分类
   */
  deleteCategory: async (id: string) => {
    const response = await api.delete<any>(`/categories/${id}`);
    return response.data;
  },

  /**
   * 初始化默认分类
   */
  initDefaultCategories: async () => {
    const response = await api.post<any>('/categories/defaults');
    return response.data;
  },
};

export default categoryService;
