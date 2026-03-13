# CrawlFlow

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Python](https://img.shields.io/badge/python-3.x-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/backend-Flask-000000?logo=flask&logoColor=white)
![React](https://img.shields.io/badge/frontend-React-61DAFB?logo=react&logoColor=111827)
![Vite](https://img.shields.io/badge/build-Vite-646CFF?logo=vite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-24-16A34A)
![Realtime](https://img.shields.io/badge/realtime-Socket.IO-EF4444)
![Architecture](https://img.shields.io/badge/architecture-DDD%20%2B%20EventBus-0F766E)

CrawlFlow 是一个面向实验、课程设计和爬虫原型验证场景的全栈抓取平台。项目整合了 Flask 后端、React/Vite 控制台、SQLAlchemy + MySQL 持久化，以及基于 Socket.IO 的实时日志与状态回传能力。

它的重点不只是“能抓取”，而是把任务创建、策略调度、动态页面回退渲染、PDF 提取、结果导出和实时观测串成一个完整工作流，方便演示、调试和扩展。

## 项目亮点

- 支持多种抓取策略：BFS、DFS 与大站优先调度。
- 支持实时监控：在 Web 界面中查看日志、任务状态和结果增量刷新。
- 提供丰富的数据提取能力：元数据解析、PDF 发现、结果导出与 `robots.txt` 检查。
- 后端采用分层设计：`view -> services -> domain -> infrastructure -> shared`，便于课程展示与后续演进。
- 已预留高级扩展方向：Hybrid HTTP / Playwright 回退渲染、动态域名评分、PDF 专用处理链路。

## 架构总览

### 系统上下文图

```mermaid
flowchart LR
    USER["学生 / 实验操作者"] --> UI["React + Vite 控制台"]
    UI -->|"REST /api/crawl"| API["Flask Blueprint"]
    UI -.->|"join room / 订阅任务"| WS["实时日志 / 状态流"]
    WS -.->|"crawl_log / tech_log"| UI
    API --> APP["CrawlerService"]
    APP --> DOMAIN["领域层<br/>Entity / Value Objects / Domain Services"]
    APP --> REPO["Repository"]
    APP --> BUS["EventBus"]
    DOMAIN --> HTTP["Requests / HybridHttpClient"]
    DOMAIN --> PARSER["HTML / robots / PDF 解析"]
    REPO --> DB[("MySQL")]
    BUS --> WS
```

### 后端分层设计

```mermaid
flowchart TB
    UI["前端控制台"] --> VIEW["view<br/>crawler_view.py"]
    VIEW --> SERVICE["services<br/>crawler_service.py"]
    SERVICE --> DOMAIN["domain<br/>task / config / result / events"]
    SERVICE --> SHARED["shared<br/>event_bus / websocket handlers / db_manager"]
    DOMAIN --> INFRA["infrastructure<br/>http / parser / playwright / queue / repository"]
    INFRA --> DB[("SQLAlchemy + MySQL")]
    SHARED --> SOCKET["Socket.IO 推送"]
```

### 分层职责对照

| 层级 | 代码位置 | 主要职责 |
| --- | --- | --- |
| 表现层 | `frontend/src/features/crawler_main` | 创建任务、展示状态、查看日志、导出结果 |
| 接口层 | `backend/src/crawl/view` | 提供 REST API，组装后端依赖，暴露导出/状态/控制接口 |
| 应用层 | `backend/src/crawl/services` | 管理任务生命周期、线程执行、队列推进与状态查询 |
| 领域层 | `backend/src/crawl/domain` | 封装任务实体、值对象、领域事件与核心规则 |
| 基础设施层 | `backend/src/crawl/infrastructure` | HTTP 请求、Playwright 回退、HTML/PDF 解析、队列和仓储实现 |
| 共享能力 | `backend/src/shared` | EventBus、WebSocket 推送、数据库 Session 管理 |

## 设计图表

### 一次抓取任务的执行时序

```mermaid
sequenceDiagram
    actor U as 用户
    participant UI as React 控制台
    participant API as Flask API
    participant S as CrawlerService
    participant Q as CrawlTask / UrlQueue
    participant D as Domain Services
    participant I as Infra Adapters
    participant R as Repository
    participant E as EventBus / WebSocket

    U->>UI: 填写抓取配置
    UI->>API: POST /api/crawl/create
    API->>S: create_crawl_task(config)
    S->>R: save_task(PENDING)
    API-->>UI: task_id

    U->>UI: 启动任务
    UI->>API: POST /api/crawl/start/:id
    API->>S: start_crawl_task(id)
    S->>Q: initialize queue

    loop 每个待抓取 URL
        S->>Q: dequeue()
        S->>I: HTTP 获取页面 / PDF
        I-->>S: response
        S->>D: 提取元数据 / 发现链接 / 识别 PDF
        D-->>S: crawl result + new links
        S->>R: save_result / save_task
        S->>E: publish domain events
        E-->>UI: crawl_log / tech_log
        UI->>API: GET /api/crawl/status/:id
        API-->>UI: 任务状态与结果统计
    end

    S->>R: save_task(COMPLETED / STOPPED)
    S->>E: publish lifecycle event
    E-->>UI: 最终状态
```

### 抓取决策与数据流

```mermaid
flowchart TD
    START["任务启动"] --> STRATEGY{"抓取策略"}
    STRATEGY -->|"BFS"| BFS["按层推进队列"]
    STRATEGY -->|"DFS"| DFS["按深度推进队列"]
    STRATEGY -->|"BIG_SITE_FIRST"| PRIORITY["优先域名加权"]

    BFS --> FETCH["取出下一个 URL"]
    DFS --> FETCH
    PRIORITY --> FETCH

    FETCH --> TYPE{"资源类型"}
    TYPE -->|"HTML"| HYBRID["HybridHttpClient"]
    TYPE -->|"PDF"| PDF["PdfDomainService"]

    HYBRID --> DYNAMIC{"内容过短 / 疑似 SPA ?"}
    DYNAMIC -->|"否"| PARSER["HtmlParserImpl"]
    DYNAMIC -->|"是"| PLAY["PlaywrightClient"]
    PLAY --> PARSER

    PARSER --> META["提取标题 / 作者 / 摘要 / 关键词"]
    PARSER --> LINKS["发现可抓取链接 / PDF 链接"]
    PDF --> PDFRESULT["提取 PDF 元数据与正文"]

    META --> RESULT["统一映射为 CrawlResult"]
    LINKS --> RESULT
    PDFRESULT --> RESULT

    RESULT --> STORE["Repository 持久化"]
    STORE --> EVENT["EventBus + WebSocket"]
    EVENT --> CONSOLE["前端日志 / 状态 / 结果面板"]
```

### 仓库与文档地图

```mermaid
flowchart LR
    ROOT["CrawlFlow"] --> FE["frontend/"]
    ROOT --> BE["backend/"]
    ROOT --> DOCS["docs/"]
    ROOT --> TESTS["tests/"]
    ROOT --> CI[".github/workflows/ci.yml"]

    FE --> FE1["src/features/crawler_main"]
    BE --> BE1["src/crawl/view"]
    BE --> BE2["src/crawl/services"]
    BE --> BE3["src/crawl/domain"]
    BE --> BE4["src/crawl/infrastructure"]
    BE --> BE5["src/shared"]
    DOCS --> D1["dev/advanced_features_design.md"]
    DOCS --> D2["development/commands.md"]
    DOCS --> D3["ai/v2_feature_update.md"]
    TESTS --> T1["integration/test_realtime_logging_backend.py"]
```

## 仓库结构

```text
.
|-- .github/                # Issue/PR 模板与 CI 配置
|-- backend/                # Flask 后端、领域模型、持久化与日志
|   |-- docs/               # 后端专用图示与技术资产
|   |-- src/
|   |   |-- crawl/
|   |   |   |-- view/       # Flask Blueprint 与组合根
|   |   |   |-- services/   # 应用服务与任务编排
|   |   |   |-- domain/     # 实体、值对象、领域服务、事件
|   |   |   `-- infrastructure/
|   |   `-- shared/         # EventBus、WebSocket、数据库管理
|   `-- test/               # 后端单元/集成测试
|-- docs/                   # 项目文档、设计说明与命令参考
|-- frontend/               # React + Vite 控制台
|   |-- src/
|   `-- test/
|-- tests/                  # 仓库级回归与跨模块集成测试
|-- CHANGELOG.md
|-- CODE_OF_CONDUCT.md
|-- CONTRIBUTING.md
|-- LICENSE
|-- README.md
`-- SECURITY.md
```

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

如果你准备启用混合渲染链路，请额外安装一次 Playwright 浏览器：

```bash
playwright install chromium
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 默认本地地址

- 前端控制台：`http://localhost:5173`
- 后端 API 与 Socket.IO：`http://localhost:5000`

## 测试

当前仓库包含：

- `22` 个后端单元/集成测试
- `1` 个前端集成测试
- `1` 个仓库级跨模块回归测试

运行方式：

```bash
# 后端测试
cd backend
python -m pytest test

# 前端测试
cd frontend
npm test -- --run

# 仓库级测试
cd ..
python -m pytest tests
```

## 文档导航

- [文档索引](docs/README.md)
- [进阶功能设计方案](docs/dev/advanced_features_design.md)
- [v2 功能更新记录](docs/ai/v2_feature_update.md)
- [开发命令速查](docs/development/commands.md)
- [仓库级测试说明](tests/README.md)

## 协作说明

- 贡献流程请见 [CONTRIBUTING.md](CONTRIBUTING.md)
- 社区行为规范请见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 安全问题披露请见 [SECURITY.md](SECURITY.md)

## 许可

本项目基于 [MIT License](LICENSE) 发布，中文说明可参考 [LICENSE.zh-CN.md](LICENSE.zh-CN.md)。
