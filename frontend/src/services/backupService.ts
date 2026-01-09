import api from './api';

const backupService = {
  /**
   * 创建备份
   */
  createBackup: async (data?: any) => {
    // 确保路径是 /backup/create 而不是 /backup
    const response = await api.post<any>('/backup/create', data);
    return response.data;
  },

  /**
   * 获取备份历史
   */
  getBackupHistory: async () => {
    const response = await api.get<any>('/backup/history');
    return response.data;
  },

  /**
   * 下载备份文件
   */
  downloadBackup: async (id: string) => {
    // 确保路径匹配后端: /backup/:id/download
    const response = await api.get(`/backup/${id}/download`, { responseType: 'blob' });
    return response;
  },

  /**
   * 恢复备份
   */
  restoreBackup: async (id: string, password?: string) => {
    // 确保路径匹配后端: /backup/:id/restore
    const response = await api.post<any>(`/backup/${id}/restore`, { password });
    return response.data;
  },

  /**
   * 上传并恢复备份
   * 注意：后端目前可能不支持此直接接口，需要配合后端修改或分步执行
   */
  uploadAndRestore: async (file: File, password?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (password) formData.append('password', password);
    // 如果后端没有此接口，这仍然会 404，但我们至少保证了命名空间正确
    const response = await api.post<any>('/backup/upload-restore', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * 删除备份
   */
  deleteBackup: async (id: string) => {
    const response = await api.delete<any>(`/backup/${id}`);
    return response.data;
  },
};

export default backupService;
