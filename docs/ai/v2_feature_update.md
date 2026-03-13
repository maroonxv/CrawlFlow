# 系统演进日志 v2.0：混合渲染与动态评分策略

**日期**：2026-01-02
**版本**：v2.0
**变更摘要**：本次更新完成了从“静态爬虫”向“智能爬虫”的架构演进，引入了基于 Playwright 的混合解析模式，以及基于反馈的动态域名评分机制。

---

## 1. 核心架构变更

### 1.1 混合解析模式
为了解决 SPA（单页应用）内容难以抓取的问题，同时兼顾爬虫性能，我们引入了“按需渲染”机制。

- **新增组件**：
  - `PlaywrightClient`（`infrastructure/playwright_client.py`）：封装无头浏览器操作。
  - `HybridHttpClient`（`infrastructure/hybrid_http_client.py`）：采用组合模式，同时持有 `HttpClientImpl`（静态抓取）与 `PlaywrightClient`（动态渲染）。
- **交互流程**：
  1. 默认使用 `requests` 发起静态请求。
  2. 应用层 `CrawlerService` 执行启发式检测：
     - 响应体长度小于 500 字符。
     - 存在 SPA 挂载点，如 `<div id="app">`、`root`、`__next`。
  3. 如果命中启发式规则，则由 `CrawlerService` 再次调用 `http_client.get(..., render_js=True)` 触发浏览器渲染。

### 1.2 动态大站优先策略
为了实现更智能的优先级调度，我们放弃了纯静态的“大站”配置，改用“静态配置 + 动态反馈”的混合策略。

- **新增组件**：
  - `DomainScoreManager`（`domain/domain_service/domain_score_manager.py`）：负责维护域名信誉分的领域服务。
- **评分逻辑**：
  - **初始分**：1.0；白名单域名固定为 10.0，黑名单固定为 0.0。
  - **反馈环**：
    - `RESOURCE_FOUND`（发现 PDF 或文档）：`+0.2`
    - `HIGH_QUALITY_CONTENT`（摘要超过 200 字）：`+0.05`
    - `FAST_RESPONSE`（响应时间小于 500ms）：`+0.02`
    - `ERROR_4XX_5XX`：`-0.5`
  - **优先级计算**：
    $$ Priority = (BasePriority + ResourceBonus) \times DomainScore \times 10 $$

---

## 2. 详细文件变更清单

### 基础设施层
| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `src/crawl/infrastructure/playwright_client.py` | **新增** | 实现 Playwright 浏览器启动、上下文管理与页面渲染。 |
| `src/crawl/infrastructure/hybrid_http_client.py` | **新增** | 实现 `IHttpClient` 接口，并根据 `render_js` 参数分发请求。 |
| `src/crawl/infrastructure/http_client_impl.py` | 修改 | 更新 `get` 方法签名以兼容接口，但不承担动态渲染逻辑。 |

### 领域层
| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `src/crawl/domain/domain_service/domain_score_manager.py` | **新增** | 实现域名分数的存储、更新与查询逻辑。 |
| `src/crawl/domain/demand_interface/i_http_client.py` | 修改 | 为接口增加 `render_js: bool` 参数。 |
| `src/crawl/domain/value_objects/crawl_config.py` | 修改 | 增加 `enable_dynamic_scoring` 配置开关。 |

### 应用层
| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `src/crawl/services/crawler_service.py` | 修改 | 1. 初始化 `DomainScoreManager`。<br>2. 在 `_execute_crawl_loop` 中植入启发式检测逻辑。<br>3. 在请求结束后收集反馈并更新分数。<br>4. 在入队时根据动态分数计算优先级。 |

### 接口层
| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `src/crawl/view/crawler_view.py` | 修改 | 在组合根中实例化 `PlaywrightClient` 并组装 `HybridHttpClient`。 |

---

## 3. 环境与依赖
本次更新引入了新的外部依赖，部署时需要执行：

```bash
pip install playwright
playwright install chromium
```

## 4. 后续优化方向
1. **浏览器池化**：当前 `PlaywrightClient` 每次请求都会启动新实例以保证隔离性，未来可以引入对象池以优化性能。
2. **指纹对抗**：`HybridHttpClient` 可以集成 `fake-useragent` 或浏览器指纹注入能力，降低被反爬识别的风险。
3. **持久化评分**：当前 `DomainScoreManager` 仅保存在内存中，重启后会重置。后续可将状态持久化到 Redis 或数据库。
