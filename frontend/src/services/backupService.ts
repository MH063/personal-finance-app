import api from './api';
import { sha256 } from '../utils/crypto';

const backupService = {
  /**
   * 创建备份
   */
  createBackup: async (data?: any) => {
    // 确保路径是 /backup/create 而不是 /backup
    const response = await api.post<any>('/backup/create', data);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 获取备份历史
   */
  getBackupHistory: async () => {
    const response = await api.get<any>('/backup/history');
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 下载备份文件并监控进度
   */
  downloadBackup: async (
    id: string, 
    onProgress?: (progressEvent: any) => void,
    cancelToken?: any
  ) => {
    return api.get(`/backup/${id}/download`, {
      responseType: 'blob',
      onDownloadProgress: onProgress,
      cancelToken: cancelToken,
      // 增加超时时间处理大文件
      timeout: 300000, // 5分钟
    });
  },

  /**
   * 校验文件完整性
   */
  verifyFileIntegrity: async (blob: Blob, expectedSize: number, expectedChecksum: string): Promise<boolean> => {
    try {
      if (!(blob instanceof Blob)) {
        console.error('[Backup] 错误: 输入数据不是 Blob 类型', typeof blob);
        return false;
      }
      
      console.log(`[Backup] 校验开始: Blob 大小=${blob.size}, 预期大小=${expectedSize}`);
      
      // 1. 验证文件大小
      if (blob.size !== expectedSize) {
        console.error(`[Backup] 文件大小校验失败: 期望 ${expectedSize}, 实际 ${blob.size}`);
        return false;
      }

      // 2. 检查校验和
      if (!expectedChecksum) {
        console.warn('[Backup] 未提供校验和，跳过完整性校验');
        return true;
      }

      // 3. 计算 SHA-256 校验和
      const arrayBuffer = await blob.arrayBuffer();
      const hashHex = await sha256(arrayBuffer);
      
      const isValid = hashHex === expectedChecksum.toLowerCase();
      if (!isValid) {
        console.error(`[Backup] 校验和校验失败: 期望 ${expectedChecksum}, 实际 ${hashHex}`);
      }
      return isValid;
    } catch (error) {
      console.error('[Backup] 校验过程中出错:', error);
      return false;
    }
  },

  /**
   * 恢复备份
   */
  restoreBackup: async (id: string, password?: string) => {
    // 确保路径匹配后端: /backup/:id/restore
    // 后端 RestoreBackupDto 要求请求体中包含 backupId 字段
    const response = await api.post<any>(`/backup/${id}/restore`, { 
      backupId: id,
      password 
    });
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
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
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 删除备份
   */
  deleteBackup: async (id: string) => {
    const response = await api.delete<any>(`/backup/${id}`);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },
};

export default backupService;
