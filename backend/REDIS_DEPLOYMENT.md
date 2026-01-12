# Redis 部署与运维手册

本文档详细介绍了个人财务管理系统中 Redis 缓存服务的部署、配置、监控及备份方案。

## 1. 环境准备

- **操作系统**: Windows (推荐 Windows 10/Server 2016 及以上)
- **Redis 版本**: 7.2.5 (Windows 移植版)
- **安装路径**: `d:\MH\redis_server\Redis-7.2.5-Windows-x64-msys2-with-Service`

## 2. 安装与配置

### 2.1 配置文件说明
核心配置文件为 `redis.windows.conf`，关键配置如下：

- **网络与安全**:
  - `bind 127.0.0.1`: 仅限本地访问
  - `requirepass PersonalFinanceRedis123!`: 启用密码认证
  - `port 6379`: 默认端口
- **持久化策略**:
  - `save 900 1`, `save 300 10`, `save 60 10000`: RDB 快照策略
  - `appendonly yes`: 启用 AOF 日志
  - `appendfsync everysec`: 每秒同步一次 AOF
- **内存限制**:
  - `maxmemory 256mb`: 内存限制为 256MB
  - `maxmemory-policy allkeys-lru`: 内存溢出时使用 LRU 淘汰策略

### 2.2 启动服务
- **手动启动**: 
  ```powershell
  .\redis-server.exe .\redis.windows.conf
  ```
- **系统服务启动**: (需管理员权限)
  ```powershell
  sc.exe create RedisService binpath= 'd:\MH\redis_server\Redis-7.2.5-Windows-x64-msys2-with-Service\redis-server.exe --service-run d:\MH\redis_server\Redis-7.2.5-Windows-x64-msys2-with-Service\redis.windows.conf' start= auto
  net start RedisService
  ```

## 3. 应用集成

后端 NestJS 通过 `ioredis` 集成。配置位于 `backend/.env`：

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=PersonalFinanceRedis123!
REDIS_DB=0
```

## 4. 监控与健康检查

- **监控接口**: `GET /api/v1/health/redis`
- **CLI 检查**:
  ```powershell
  .\redis-cli.exe -a PersonalFinanceRedis123! ping
  ```
- **关键指标**:
  - 内存使用率
  - 命中率 (Keyspace hits/misses)
  - 连接数 (Connected clients)

## 5. 备份与恢复方案

### 5.1 数据备份
Redis 数据存储在安装目录下的 `dump.rdb` (快照) 和 `appendonly.aof` (日志) 中。
- **定时备份脚本**: 建议每天定时将 `dump.rdb` 复制到备份存储目录。

### 5.2 数据恢复
1. 停止 Redis 服务。
2. 将备份的 `dump.rdb` 或 `appendonly.aof` 覆盖到安装目录。
3. 重新启动 Redis 服务。

## 6. 性能参考 (Benchmark)
在本地开发环境下的测试结果 (10000 次请求):
- **SET**: ~37,000 req/s
- **GET**: ~41,000 req/s
- **平均延迟 (p50)**: < 1ms
