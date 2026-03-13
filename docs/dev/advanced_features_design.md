# 爬虫系统进阶功能详细设计方案（v1.0）

本文档详细描述了引入 **Playwright 动态渲染** 与 **动态大站优先策略** 的设计方案。本方案遵循项目现有的 DDD 分层架构。

---

## 1. 功能一：混合解析模式

### 1.1 设计目标
解决传统 HTTP 客户端无法抓取 React、Vue 等 SPA（单页应用）动态生成内容的问题。采用“按需渲染”策略，默认执行静态抓取，仅在检测到页面为空壳或明确需要时切换到浏览器渲染，以平衡性能与抓取能力。

### 1.2 核心流程
1. **初次请求**：使用轻量级 `requests` 获取 HTML。
2. **启发式检测**：判断 HTML 是否为“空壳”，例如内容过短，或仅包含 `<div id="app"></div>`。
3. **降级重试**：如果被判定为动态页面，则调用 `Playwright` 启动无头浏览器渲染页面，并获取最终 DOM。
4. **透明处理**：对上层业务逻辑保持透明，尽量维持 `HttpResponse` 的结构一致。

### 1.3 文件变更清单

| 所在层 | 目录或文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- | :--- |
| 基础设施层 | `backend/src/crawl/infrastructure/playwright_client.py` | **新增** | 封装 Playwright 的底层操作，包括启动、页面池与渲染。 |
| 基础设施层 | `backend/src/crawl/infrastructure/hybrid_http_client.py` | **新增** | 组合 `requests` 与 `playwright_client`，实现智能切换。 |
| 基础设施层 | `backend/src/crawl/infrastructure/__init__.py` | 修改 | 导出新的客户端类。 |
| 领域层 | `backend/src/crawl/domain/demand_interface/i_http_client.py` | 修改 | 为接口方法 `get` 增加 `render_js` 参数，默认值为 `False`。 |
| 应用层 | `backend/src/crawl/services/crawler_service.py` | 修改 | 在爬取循环中加入“检测 - 重试”逻辑。 |

### 1.4 伪代码实现

#### 1.4.1 基础设施层：Playwright 封装
**文件**：`backend/src/crawl/infrastructure/playwright_client.py`

```python
class PlaywrightClient:
    def __init__(self):
        self._browser = None
        self._playwright = None

    def start(self):
        # 启动 playwright 和 chromium
        pass

    def stop(self):
        # 关闭资源
        pass

    def fetch_page(self, url: str, wait_selector: str = None) -> str:
        """
        启动新页面 -> 访问 URL -> 等待网络空闲或指定元素 -> 获取 content()
        """
        # 伪代码
        page = self._browser.new_page()
        try:
            page.goto(url, wait_until="networkidle")
            # 可选：滚动到底部触发懒加载
            return page.content()
        finally:
            page.close()
```

#### 1.4.2 基础设施层：混合 HTTP 客户端
**文件**：`backend/src/crawl/infrastructure/hybrid_http_client.py`

```python
class HybridHttpClient(IHttpClient):
    def __init__(self, request_session, playwright_client):
        self._session = request_session
        self._pw_client = playwright_client

    def get(self, url: str, render_js: bool = False) -> HttpResponse:
        if render_js:
            try:
                # 使用 Playwright 获取页面内容
                html_content = self._pw_client.fetch_page(url)
                return HttpResponse(status=200, content=html_content, url=url)
            except Exception as e:
                return HttpResponse(is_success=False, error_message=str(e))
        else:
            # 使用现有 requests 逻辑
            return self._session.get(url)
```

#### 1.4.3 应用层：智能重试逻辑
**文件**：`backend/src/crawl/services/crawler_service.py`

```python
# 在 _execute_crawl_loop 方法中

# 1. 第一次尝试：静态抓取
response = self._http.get(url, render_js=False)

# 2. 启发式检测
need_dynamic = False
if response.is_success:
    # 规则 1：内容过短
    if len(response.content) < 500:
        need_dynamic = True
    # 规则 2：特征检测（这里可以调用 HtmlParser 提供的辅助方法）
    elif "<div id=\"app\"><\/div>" in response.content:
        need_dynamic = True

# 3. 动态渲染重试
if need_dynamic:
    print(f"[Hybrid] 检测到动态页面，切换至浏览器渲染: {url}")
    response = self._http.get(url, render_js=True)

if not response.is_success:
    # 错误处理...
```

---

## 2. 功能二：动态大站优先策略

### 2.1 设计目标
从“静态配置”演进为“动态反馈”。系统根据运行时抓取质量，例如资源数量、页面质量、响应速度与错误率，自动调整域名权重，并结合用户配置的黑白名单，实时计算新发现 URL 的入队优先级。

### 2.2 评分模型
最终优先级公式：
$$ Priority = (BaseScore + ResourceBonus) \times DomainWeight $$

- **基础分**：普通页面计 1 分。
- **资源加分**：发现 PDF 或文档资源时，加 5 分。
- **域名权重**：默认值为 1.0，取值范围为 `[0.1, 10.0]`。

**奖惩规则表：**
| 事件 | 分值调整 | 说明 |
| :--- | :--- | :--- |
| 发现资源（PDF 或文档） | +0.2 | 内容价值较高 |
| 页面字数大于 1000 | +0.05 | 内容较丰富 |
| 响应时间小于 200ms | +0.02 | 站点性能较好 |
| HTTP 4xx 或 5xx | -0.5 | 站点质量较差 |
| 哈希去重碰撞 | -0.1 | 内容重复度较高 |

### 2.3 文件变更清单

| 所在层 | 目录或文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- | :--- |
| 领域层 | `backend/src/crawl/domain/domain_service/domain_score_manager.py` | **新增** | 实现核心评分逻辑，并维护域名分数状态。 |
| 领域层 | `backend/src/crawl/domain/value_objects/crawl_config.py` | 修改 | 增加 `enable_dynamic_scoring` 开关。 |
| 应用层 | `backend/src/crawl/services/crawler_service.py` | 修改 | 1. 注入 `ScoreManager`。<br>2. 入队前计算优先级。<br>3. 抓取完成后反馈结果。 |

### 2.4 伪代码实现

#### 2.4.1 领域层：评分管理器
**文件**：`backend/src/crawl/domain/domain_service/domain_score_manager.py`

```python
class DomainScoreManager:
    def __init__(self, whitelist: List[str], blacklist: List[str]):
        self._scores = {} # Dict[domain, float]
        self._whitelist = set(whitelist)
        self._blacklist = set(blacklist)

    def get_score(self, url: str) -> float:
        domain = self._extract_domain(url)
        
        # 黑白名单拥有绝对优先级
        if domain in self._whitelist:
            return 10.0
        if domain in self._blacklist:
            return 0.0
        
        return self._scores.get(domain, 1.0) # 默认 1.0

    def update_score(self, url: str, event_type: str):
        domain = self._extract_domain(url)
        if domain in self._whitelist or domain in self._blacklist:
            return # 人工干预的域名不自动调整

        current = self._scores.get(domain, 1.0)
        delta = 0.0
        
        if event_type == "RESOURCE_FOUND":
            delta = 0.2
        elif event_type == "HIGH_QUALITY_CONTENT":
            delta = 0.05
        elif event_type == "FAST_RESPONSE":
            delta = 0.02
        elif event_type == "ERROR_4XX_5XX":
            delta = -0.5
        
        # 将范围限制在 [0.1, 5.0]，避免分数溢出
        self._scores[domain] = max(0.1, min(5.0, current + delta))
```

#### 2.4.2 应用层：集成逻辑
**文件**：`backend/src/crawl/services/crawler_service.py`

```python
# 初始化
self.score_manager = DomainScoreManager(
    whitelist=config.priority_domains, 
    blacklist=[]
)

# 在 _execute_crawl_loop 循环末尾（反馈阶段）
# -------------------------------------------------
if response.is_success:
    # 检查响应速度
    if response.elapsed < 0.2:
        self.score_manager.update_score(url, "FAST_RESPONSE")

    # 检查内容质量（假设 metadata 中可以拿到摘要长度）
    if len(metadata.abstract or "") > 500:
        self.score_manager.update_score(url, "HIGH_QUALITY_CONTENT")
else:
    self.score_manager.update_score(url, "ERROR_4XX_5XX")

if len(pdf_links) > 0:
    self.score_manager.update_score(url, "RESOURCE_FOUND")


# 在新链接入队阶段（计算阶段）
# -------------------------------------------------
for link in crawlable_links:
    if not task.is_url_visited(link):
        # 1. 计算基础分
        base_priority = 0
        if link.endswith(".pdf"):
            base_priority = 5
        else:
            base_priority = 1
            
        # 2. 获取动态权重
        domain_weight = self.score_manager.get_score(link)
        
        # 3. 计算最终优先级
        final_priority = int(base_priority * domain_weight * 10) # 转为整数以便比较
        
        queue.enqueue(link, depth + 1, priority=final_priority)
```
