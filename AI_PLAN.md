# 随启随用型本地 AI 专家系统开发方案

## 1. 项目概述

本方案旨在为个人财务应用升级一套**永久免费、彻底去中心化、高性能**的本地 AI 决策引擎。
该系统基于 **Ollama** 本地大模型框架，专为 **AMD Ryzen 5 5600X + Radeon RX 6600** 硬件环境定制，实现“应用启动即服务，应用关闭即释放”的零干扰运行模式。

### 1.1 核心目标
*   **永久免费**：利用本地算力，0 API 成本。
*   **极致性能**：利用 RX 6600 (8GB) 运行 7B 量化模型，实现秒级响应。
*   **随启随用**：AI 服务生命周期与主应用绑定，不残留后台进程。
*   **互不干扰**：通过 CPU 线程隔离和显存限额，确保系统流畅运行。

---

## 2. 核心架构设计

### 2.1 硬件适配与模型选型
针对目标硬件环境的“甜点级”配置：

*   **运行框架**：Ollama (Windows ROCm 版)
*   **核心模型**：`Qwen2.5-7B-Instruct-GGUF`
*   **量化策略**：`Q4_K_M` (4-bit 量化)
    *   **显存占用**：约 4.8 GB (占 RX 6600 总显存的 60%)
    *   **系统预留**：约 3.2 GB (保障 OS、视频播放及日常操作)
*   **CPU 策略**：限制使用 4 个逻辑核心 (5600X 共 12 线程)，预留 66% CPU 算力。

### 2.2 软件生命周期管理 (Lifecycle Management)
由 Electron 主进程充当“指挥官”，管理 AI 服务的生杀大权。

```mermaid
graph TD
    A[用户启动 App] --> B[Electron 主进程]
    B --> C{检测 Ollama 服务}
    C -- 未运行 --> D[静默启动 Ollama]
    C -- 已运行 --> E[连接现有服务]
    D --> F[应用运行中 (AI 待命)]
    E --> F
    F --> G[用户关闭 App]
    G --> H[发送 Kill 指令]
    H --> I[释放 4.8GB 显存]
    H --> J[释放 CPU 占用]
```

### 2.3 资源调度与保护机制
*   **显存自动释放 (Keep-Alive)**：设置 `OLLAMA_KEEP_ALIVE=5m`。若 5 分钟无对话，模型自动卸载，显存占用归零。
*   **进程优先级**：Ollama 进程设置为 `Low Priority`，确保前台应用（如游戏、视频剪辑）拥有绝对优先权。
*   **并发控制**：后端 `AiService` 限制同一时间仅处理 1 个重型推理任务。

---

## 3. 功能模块详解

### 3.1 自然语言查账 (NLQ - Natural Language Query)
实现“像问会计一样问数据”。

*   **技术路径**：Text-to-SQL
*   **工作流**：
    1.  用户输入：“上个月我在咖啡上花了多少钱？”
    2.  Prompt 注入：包含简化版数据库 Schema (Category, Transaction)。
    3.  Local LLM 生成 SQL：`SELECT SUM(amount) FROM transactions WHERE category_id = (SELECT id FROM categories WHERE name LIKE '%咖啡%') AND date BETWEEN ...`
    4.  后端沙箱执行：只读权限执行 SQL。
    5.  结果润色：LLM 将数字 `280.50` 转换为“您上个月在咖啡上共消费 280.50 元。”

### 3.2 智能财务规划 (Smart Planning)
实现“主动式财务健康体检”。

*   **技术路径**：RAG (检索增强生成) + Chain of Thought
*   **工作流**：
    1.  **数据聚合**：后端定期聚合财务摘要（收支比、储蓄率、高频消费 TOP3）。
    2.  **Prompt 构建**：
        > "你是一个专业理财师。用户本月收入 10000，支出 8000 (占比 80%)，其中餐饮支出占比 40%。请给出 3 条具体的优化建议，语气要鼓励且务实。"
    3.  **推理生成**：Qwen2.5 生成建议。
    4.  **前端展示**：以卡片形式展示在 Dashboard。

---

## 4. 实施路线图

### 第一阶段：基础设施搭建 (Infrastructure)
*   [ ] **Electron 集成**：编写 `ollama-manager.ts`，实现子进程管理。
*   [ ] **环境检测**：应用启动时检查 Ollama 安装状态与显卡驱动状态。
*   [ ] **后端适配**：升级 `AiService`，封装 `chatWithLocalLLM` 接口。

### 第二阶段：核心功能开发 (Core Features)
*   [ ] **NLQ 原型**：实现基础的 Text-to-SQL 转换与执行。
*   [ ] **Prompt 工程**：针对 Qwen2.5-7B 优化 Prompt Template，提高 SQL 准确率。
*   [ ] **前端交互**：设计悬浮式 AI 助手组件 (Floating Assistant)。

### 第三阶段：性能优化与交付 (Optimization)
*   [ ] **资源限制配置**：配置环境变量 `OLLAMA_NUM_GPU` 和 `OLLAMA_KEEP_ALIVE`。
*   [ ] **压力测试**：在开启 4K 视频播放的同时进行 AI 对话，调整优先级参数。
*   [ ] **用户引导**：编写首次使用引导页（提示下载模型等）。

---

## 5. 开发规范

*   **隐私原则**：所有 Prompt 和数据**严禁**发送到任何云端 API。
*   **错误处理**：当本地 AI 响应超时或失败时，优雅降级为传统规则逻辑，不报错。
*   **代码注释**：AI 相关核心逻辑必须包含详细注释，说明 Prompt 设计意图。
