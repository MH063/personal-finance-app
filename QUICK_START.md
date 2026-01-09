# 个人财务管理应用程序 - 快速启动指南

## 📋 系统要求

### 必需软件
- **Node.js**: 版本 >= 20.0.0
- **PostgreSQL**: 版本 >= 18
- **npm**: 版本 >= 10.0.0

### 推荐版本
- Node.js: 20.x LTS
- PostgreSQL: 18.x
- Windows 10/11, macOS 10.15+, Ubuntu 20.04+

## 🗄️ 数据库配置

### 1. 创建数据库
```sql
CREATE DATABASE "personal-finance-app";
```

### 2. 连接信息
在 `backend/.env` 文件中配置：
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password_here
DB_DATABASE=personal-finance-app
```

## 🚀 快速启动

### 方法一：一键启动 (推荐)
```bash
# Windows
双击运行 start-all.bat

# Linux/Mac
./start-all.sh
```

### 方法二：分别启动

#### 1. 启动后端服务
```bash
# Windows
cd backend
npm install
npm run start:dev

# 或者双击 start-backend.bat

# Linux/Mac
cd backend
npm install
npm run start:dev

# 或者
./start-backend.sh
```

#### 2. 启动前端服务 (新终端)
```bash
# Windows
cd frontend
npm install
npm run dev

# 或者双击 start-frontend.bat

# Linux/Mac
cd frontend
npm install
npm run dev

# 或者
./start-frontend.sh
```

## 🌐 访问地址

启动成功后，访问以下地址：

- **前端界面**: http://localhost:8000
- **后端API**: http://localhost:4000/api/v1
- **API文档**: http://localhost:4000/docs

## 📝 首次使用

1. **注册账户**
   - 访问 http://localhost:8000
   - 点击"立即注册"
   - 填写用户名、邮箱、密码等信息

2. **登录系统**
   - 使用注册的账户登录

3. **创建默认分类**
   - 首次登录时会自动创建收支分类
   - 可在"设置"中自定义分类

## 🔧 开发相关

### 项目结构
```
personal-finance-app/
├── backend/                 # NestJS后端
│   ├── src/
│   │   ├── auth/           # 认证模块
│   │   ├── categories/      # 分类管理
│   │   ├── transactions/    # 交易记录
│   │   ├── debts/          # 债务管理
│   │   ├── statistics/     # 数据统计
│   │   └── backup/         # 备份恢复
│   └── package.json
├── frontend/               # Electron+React前端
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── store/         # 状态管理
│   │   └── components/    # 通用组件
│   └── package.json
└── docs/                  # 文档
```

### 数据库迁移
```bash
# 生成迁移文件
npm run migration:generate

# 运行迁移
npm run migration:run

# 回滚迁移
npm run migration:revert
```

### 构建应用
```bash
# 构建前端
cd frontend
npm run build

# 构建Electron应用
npm run build:electron
```

## ⚠️ 常见问题

### 1. 端口占用
如果4000端口被占用，修改 `backend/.env` 中的PORT：
```env
PORT=4001
```
然后更新前端代理配置。

### 2. 数据库连接失败
- 检查PostgreSQL服务是否启动
- 确认数据库名、用户名、密码正确
- 检查防火墙设置

### 3. 依赖安装失败
```bash
# 清理npm缓存
npm cache clean --force

# 删除node_modules重新安装
rm -rf node_modules package-lock.json
npm install
```

### 4. 权限问题 (Linux/Mac)
```bash
# 给shell脚本添加执行权限
chmod +x *.sh
```

### 5. Electron启动失败
- 确保所有依赖安装完成
- 检查Electron版本兼容性

## 📞 技术支持

如遇到问题，请检查：
1. Node.js版本是否符合要求
2. PostgreSQL配置是否正确
3. 依赖是否安装完整
4. 端口是否被占用

## 🔒 安全注意事项

- 生产环境请修改默认密码和密钥
- 定期备份数据库
- 使用HTTPS协议
- 启用防火墙保护

## 📚 功能模块

### 核心功能
- ✅ 用户认证 (注册/登录)
- ✅ 收支记录管理
- ✅ 分类管理 (多级分类)
- ✅ 债务管理
- ✅ 数据统计分析
- ✅ 数据备份恢复
- ✅ 财务报表导出

### 界面特性
- 🎨 现代化UI设计
- 📱 响应式布局
- 🌙 深色/浅色主题
- 📊 数据可视化
- 🔍 高级搜索筛选
- 💾 本地数据存储

---

**版本**: v1.0.0  
**最后更新**: 2025-01-08  
**Node.js版本**: >=20.0.0  
**PostgreSQL版本**: >=18
