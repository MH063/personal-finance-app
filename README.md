# 个人财务管理应用程序

一个功能强大的桌面财务管理应用，帮助您全面记录、管理和分析个人财务状况。

## ✨ 功能特性

### 💰 核心功能
- ✅ **用户认证** - 安全的注册登录系统
- ✅ **收支记录** - 详细的收入支出记录
- ✅ **分类管理** - 多级分类体系
- ✅ **债务跟踪** - 双向债务管理
- ✅ **数据统计** - 可视化图表分析
- ✅ **备份恢复** - 数据安全保障

### 🎨 用户界面
- 🎨 现代化 Ant Design UI
- 📱 响应式布局设计
- 🌙 深色/浅色主题切换
- 📊 ECharts 数据可视化
- 🔍 高级搜索筛选

### 🔒 安全特性
- 🔐 JWT 身份认证
- 🗄️ PostgreSQL 数据库
- 🔒 数据加密存储
- 💾 自动备份机制

## 🚀 快速开始

### 📋 系统要求
- **Node.js**: >= 20.0.0
- **PostgreSQL**: >= 18
- **操作系统**: Windows 10/11, macOS 10.15+, Ubuntu 20.04+

### 🗄️ 数据库设置
```sql
-- 创建数据库
CREATE DATABASE "personal-finance-app";
```

环境变量配置 (`backend/.env`):
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password_here
DB_DATABASE=personal-finance-app
PORT=4000
```

### ⚡ 一键启动
```bash
# Windows (双击运行)
start-all.bat

# Linux/Mac
./start-all.sh
```

### 🔧 分别启动
```bash
# 1. 启动后端 (端口 4000)
cd backend
npm install
npm run start:dev

# 2. 启动前端 (端口 8000)
cd frontend
npm install
npm run dev
```

## 🌐 访问地址

- **前端界面**: http://localhost:8000
- **后端API**: http://localhost:4000/api/v1
- **API文档**: http://localhost:4000/docs

## 📚 使用说明

### 首次使用
1. 访问 http://localhost:8000
2. 注册新账户
3. 登录系统开始使用

### 主要功能
- **仪表盘**: 查看收支概览和统计图表
- **收入管理**: 记录和管理收入
- **支出管理**: 分类记录支出
- **债务管理**: 跟踪借贷关系
- **数据统计**: 生成财务报表
- **设置管理**: 自定义分类和偏好

### ⚠️ 重要变更说明 (2025-01)
- **数据删除机制变更**：
  - 收入管理和支出管理模块（分类及交易记录）的删除操作已从"逻辑删除"更改为"物理删除"（永久删除）。
  - **分类删除**：
    - 若分类下无关联数据，直接物理删除。
    - 若分类下有关联交易，系统将提示选择"强制删除"（同时永久删除关联交易）或"迁移数据"（保留交易并移动到新分类）。
  - **交易删除**：删除交易记录为永久操作，数据将从数据库中完全移除，不可恢复。
  - 请在执行删除操作前仔细确认。

## 🏗️ 技术栈

### 后端技术
- **框架**: NestJS v10
- **数据库**: PostgreSQL 18+
- **ORM**: TypeORM v0.3
- **认证**: JWT + Passport
- **API文档**: Swagger/OpenAPI
- **调度**: @nestjs/schedule

### 前端技术
- **框架**: React 18 + TypeScript
- **UI库**: Ant Design v5
- **状态管理**: Redux Toolkit
- **图表**: ECharts + echarts-for-react
- **构建工具**: Vite 5
- **桌面应用**: Electron 35.7.5+

### 开发工具
- **代码规范**: ESLint + Prettier
- **测试**: Jest + Vitest
- **构建**: Webpack + Electron Builder
- **版本控制**: Git

## 📁 项目结构

```
personal-finance-app/
├── backend/                 # NestJS后端项目
│   ├── src/
│   │   ├── auth/           # 用户认证模块
│   │   ├── categories/     # 分类管理模块
│   │   ├── transactions/  # 交易记录模块
│   │   ├── debts/         # 债务管理模块
│   │   ├── statistics/    # 数据统计模块
│   │   ├── backup/        # 备份恢复模块
│   │   └── entities/      # 数据实体
│   └── database/          # 数据库迁移
├── frontend/              # React前端项目
│   ├── src/
│   │   ├── pages/        # 页面组件
│   │   ├── components/   # 通用组件
│   │   ├── store/        # 状态管理
│   │   └── services/     # API服务
│   └── electron/         # Electron配置
├── docs/                  # 项目文档
├── start-all.bat         # Windows一键启动
├── start-all.sh          # Linux/Mac一键启动
└── QUICK_START.md        # 快速启动指南
```

## 🔧 开发指南

### 数据库操作
```bash
# 生成迁移文件
npm run migration:generate

# 运行迁移
npm run migration:run

# 回滚迁移
npm run migration:revert
```

### 构建生产版本
```bash
# 构建前端
cd frontend && npm run build

# 构建Electron应用
cd frontend && npm run build:electron
```

### 运行测试
```bash
# 后端测试
cd backend && npm run test

# 前端测试
cd frontend && npm run test
```

## ⚠️ 常见问题

### 端口占用
- 后端端口冲突: 修改 `backend/.env` 中的 `PORT`
- 前端端口冲突: 修改 `frontend/vite.config.ts` 中的 `port`

### 数据库连接
- 确保 PostgreSQL 服务已启动
- 检查数据库连接配置
- 验证用户名和密码

### 依赖安装失败
```bash
# 清理缓存
npm cache clean --force

# 重新安装
rm -rf node_modules package-lock.json
npm install
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📞 技术支持

如遇到问题，请：
1. 查看 [快速启动指南](QUICK_START.md)
2. 检查 [常见问题](QUICK_START.md#常见问题) 部分
3. 提交 Issue

---

**版本**: v1.0.0  
**更新时间**: 2026-01-09  
**Node.js**: >= 20.0.0  
**PostgreSQL**: >= 18
