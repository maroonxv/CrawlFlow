import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import axios from "axios";
import "./CrawlerMain.css";

const API = "/api/crawl";
const SOCKET = `${window.location.protocol}//${window.location.hostname}:5000/crawl`;
const POLL_MS = 2000;
const STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
};
const STATUS_TEXT = {
  PENDING: "待启动",
  RUNNING: "运行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  FAILED: "失败",
  STOPPED: "已停止",
};
const DEFAULT_FORM = {
  name: "",
  start_url: "https://crawler-test.com/",
  strategy: "BFS",
  max_depth: 3,
  max_pages: 5,
  interval: 0.2,
  allow_domains: "",
  priority_domains: "",
  blacklist: "",
};
const DEFAULT_EDIT = { interval: 1, max_pages: 100, max_depth: 3 };
const STRATEGY_TEXT = {
  BFS: "按层推进，适合全站扫描。",
  DFS: "沿单条链路深入，适合主题挖掘。",
  BIG_SITE_FIRST: "优先抓取重点域名，再回收其它站点。",
};
const TEMPLATES = [
  {
    name: "图书站点 BFS",
    hint: "基础联通性验证",
    data: {
      name: "Books_BFS_Test",
      start_url: "http://books.toscrape.com/",
      strategy: "BFS",
      max_depth: 3,
      max_pages: 30,
      interval: 0.5,
      allow_domains: "books.toscrape.com",
      priority_domains: "",
      blacklist: "",
    },
  },
  {
    name: "名言站点 DFS",
    hint: "适合深度优先测试",
    data: {
      name: "Quotes_DFS_Deep",
      start_url: "http://quotes.toscrape.com/",
      strategy: "DFS",
      max_depth: 4,
      max_pages: 25,
      interval: 0.5,
      allow_domains: "quotes.toscrape.com",
      priority_domains: "",
      blacklist: "",
    },
  },
  {
    name: "多域名优先调度",
    hint: "重点抓 quotes.toscrape.com",
    data: {
      name: "Priority_Quotes_First",
      start_url: "http://toscrape.com/",
      strategy: "BIG_SITE_FIRST",
      max_depth: 3,
      max_pages: 30,
      interval: 0.6,
      allow_domains: "toscrape.com, books.toscrape.com, quotes.toscrape.com",
      priority_domains: "quotes.toscrape.com",
      blacklist: "",
    },
  },
];

const csv = (value = "") => value.split(",").map((v) => v.trim()).filter(Boolean);
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url || "-";
  }
};
const errorText = (error) => error?.response?.data?.error || error?.message || "请求失败";
const timeText = (value) => {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};
const logTime = (value) => {
  if (!value) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 19) || String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};
const taskNameOf = (name, id) => {
  const raw = (name || "").trim();
  if (!raw) return id || "";
  if (id && raw === id) return id;
  if (id && raw.includes(id)) return raw.replaceAll(id, "").trim() || id;
  return raw;
};
const domainsOf = (value = "") =>
  [...new Set(csv(value).map((item) => {
    try {
      return new URL(item.includes("://") ? item : `http://${item}`).hostname;
    } catch {
      return null;
    }
  }).filter(Boolean))];
const configOf = (task) => {
  const c = task?.config || {};
  return {
    start: c.start_url || task?.start_url || "未提供",
    strategy: c.strategy || "-",
    allow: Array.isArray(c.allow_domains) ? c.allow_domains.join(", ") || "未设置" : c.allow_domains || "未设置",
    depth: c.max_depth ?? "-",
    pages: c.max_pages ?? "-",
    interval: c.interval ?? c.request_interval ?? "-",
    priority: Array.isArray(c.priority_domains) ? c.priority_domains.join(", ") || "未设置" : c.priority_domains || "未设置",
    blacklist: Array.isArray(c.blacklist) ? c.blacklist.join(", ") || "未设置" : c.blacklist || "未设置",
  };
};

const StatusBadge = ({ status }) => (
  <span className={`status-badge ${(status || "PENDING").toLowerCase()}`}>
    {STATUS_TEXT[status] || status || "待启动"}
  </span>
);

function LogViewer({ logs }) {
  const ref = useRef(null);
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    if (pinned && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs, pinned]);
  if (!logs.length) {
    return <div className="empty-state">暂无实时日志，启动任务后这里会持续刷新。</div>;
  }
  return (
    <div className="viewer log-viewer" ref={ref} onScroll={() => {
      if (!ref.current) return;
      const d = ref.current.scrollHeight - ref.current.scrollTop - ref.current.clientHeight;
      setPinned(d <= 48);
    }}>
      {logs.map((log, index) => (
        <div key={`${log.category || log.event_type || "log"}-${index}`} className="log-row">
          <span className="log-time">{logTime(log.timestamp)}</span>
          <span className={`log-level ${(log.level || "info").toLowerCase()}`}>{(log.level || "INFO").toUpperCase()}</span>
          <span className="log-category">{log.category || log.event_type || "system"}</span>
          <div className="log-message">{log.message || log.data?.message || JSON.stringify(log.data || {})}</div>
        </div>
      ))}
    </div>
  );
}

function ResultViewer({ results }) {
  if (!results.length) {
    return <div className="empty-state">暂无结果，任务运行或完成后会在这里展示采集内容。</div>;
  }
  return (
    <div className="viewer">
      <table className="results-table">
        <thead>
          <tr>
            <th>页面</th>
            <th>深度</th>
            <th>作者</th>
            <th>摘要</th>
            <th>关键词</th>
            <th>时间</th>
            <th>PDF</th>
            <th>标签</th>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => (
            <tr key={`${item.url}-${index}`} className={item.tags?.includes("big_site") ? "highlight" : ""}>
              <td className="page-cell">
                <div className="result-title">{item.title || "未解析标题"}</div>
                <a href={item.url} target="_blank" rel="noreferrer" className="result-url" title={item.url}>{hostOf(item.url)}</a>
              </td>
              <td>{item.depth ?? "-"}</td>
              <td>{item.author || "-"}</td>
              <td className="truncate" title={item.abstract || ""}>{item.abstract || "-"}</td>
              <td className="truncate" title={Array.isArray(item.keywords) ? item.keywords.join("、") : item.keywords || ""}>{Array.isArray(item.keywords) ? item.keywords.join("、") : item.keywords || "-"}</td>
              <td>{timeText(item.crawled_at)}</td>
              <td>{item.pdf_count ?? 0}</td>
              <td>{item.tags?.length ? item.tags.join(", ") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrawlerMain() {
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [logs, setLogs] = useState({});
  const [results, setResults] = useState({});
  const [taskStatuses, setTaskStatuses] = useState({});
  const [viewMode, setViewMode] = useState("logs");
  const [notice, setNotice] = useState(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [editConfig, setEditConfig] = useState({ ...DEFAULT_EDIT });
  const socketRef = useRef(null);
  const runningTaskIdRef = useRef(null);
  const resultsRef = useRef({});

  const notify = (type, message) => setNotice({ type, message });
  const updateStatus = (taskId, data) => {
    setTaskStatuses((prev) => ({ ...prev, [taskId]: data }));
    setTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, name: data.name || task.name, status: data.status || task.status } : task));
    if (data.status === STATUS.RUNNING) setRunningTaskId(taskId);
    if (data.status !== STATUS.RUNNING && runningTaskIdRef.current === taskId) setRunningTaskId(null);
  };
  const fetchResults = async (taskId) => {
    const response = await axios.get(`${API}/results/${taskId}`);
    setResults((prev) => ({ ...prev, [taskId]: response.data }));
  };
  const fetchStatus = async (taskId) => {
    try {
      const response = await axios.get(`${API}/status/${taskId}`);
      const data = response.data;
      updateStatus(taskId, data);
      const currentCount = resultsRef.current[taskId]?.length || 0;
      if ((data.result_count || 0) > currentCount) await fetchResults(taskId);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { runningTaskIdRef.current = runningTaskId; }, [runningTaskId]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    let mounted = true;
    axios.get(`${API}/tasks`).then((response) => {
      if (!mounted) return;
      const loaded = (response.data || []).map((task) => ({ ...task, createdAt: task.created_at ? new Date(task.created_at) : null }));
      setTasks(loaded);
      const next = {};
      loaded.forEach((task) => {
        next[task.id] = { task_id: task.id, name: task.name, status: task.status || STATUS.PENDING, visited_count: task.visited_count || 0, result_count: 0, queue_size: 0, current_depth: 0 };
        if (task.status === STATUS.RUNNING) setRunningTaskId(task.id);
      });
      setTaskStatuses(next);
    }).catch(() => notify("error", "任务列表加载失败，请检查后端服务。"));

    socketRef.current = io(SOCKET);
    socketRef.current.on("crawl_log", (data) => {
      const taskId = data.task_id || data.extra?.task_id;
      if (!taskId) return;
      setLogs((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), data] }));
      if (data.event_type === "PageCrawledEvent" || data.event_type === "PAGE_CRAWLED") {
        const next = { title: data.data?.title, url: data.data?.url, depth: data.data?.depth, crawled_at: data.timestamp, pdf_count: data.data?.pdf_count, author: data.data?.author, abstract: data.data?.abstract, keywords: data.data?.keywords, tags: data.data?.tags || [] };
        setResults((prev) => {
          const current = prev[taskId] || [];
          return current.some((item) => item.url === next.url) ? prev : { ...prev, [taskId]: [...current, next] };
        });
      }
    });
    socketRef.current.on("tech_log", (data) => {
      const taskId = data.extra?.task_id || runningTaskIdRef.current;
      if (!taskId) return;
      setLogs((prev) => ({ ...prev, [taskId]: [...(prev[taskId] || []), { ...data, category: data.category || "tech_log" }] }));
    });
    return () => {
      mounted = false;
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (socketRef.current) socketRef.current.emit("join", { room: selectedTaskId });
    fetchStatus(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    const ids = [...new Set([selectedTaskId, runningTaskId].filter(Boolean))];
    if (!ids.length) return undefined;
    const id = window.setInterval(() => ids.forEach(fetchStatus), POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedTaskId, runningTaskId]);

  useEffect(() => {
    const task = tasks.find((item) => item.id === selectedTaskId);
    if (!task?.config) return;
    setEditConfig({
      interval: task.config.interval ?? task.config.request_interval ?? 1,
      max_pages: task.config.max_pages ?? 100,
      max_depth: task.config.max_depth ?? 3,
    });
  }, [selectedTaskId, tasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const status = selectedTaskId ? taskStatuses[selectedTaskId] : null;
  const taskResults = selectedTaskId ? results[selectedTaskId] || [] : [];
  const taskLogs = selectedTaskId ? logs[selectedTaskId] || [] : [];
  const taskConfig = configOf(selectedTask);
  const runningCount = Object.values(taskStatuses).filter((item) => item.status === STATUS.RUNNING).length;
  const orderedTasks = [...tasks].sort((a, b) => {
    const order = (s) => (s === STATUS.RUNNING ? 0 : s === STATUS.PAUSED ? 1 : s === STATUS.PENDING ? 2 : 3);
    const diff = order(taskStatuses[a.id]?.status || a.status) - order(taskStatuses[b.id]?.status || b.status);
    return diff || (new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  });

  const submitTask = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...formData,
        allow_domains: csv(formData.allow_domains),
        priority_domains: csv(formData.priority_domains),
        blacklist: csv(formData.blacklist),
      };
      const response = await axios.post(`${API}/create`, payload);
      const taskId = response.data.task_id;
      const nextTask = { id: taskId, name: formData.name || taskId, status: STATUS.PENDING, start_url: formData.start_url, createdAt: new Date(), config: { ...payload } };
      setTasks((prev) => [nextTask, ...prev]);
      setTaskStatuses((prev) => ({ ...prev, [taskId]: { task_id: taskId, name: nextTask.name, status: STATUS.PENDING, visited_count: 0, result_count: 0, queue_size: 0, current_depth: 0 } }));
      setSelectedTaskId(taskId);
      setViewMode("logs");
      setFormData({ ...DEFAULT_FORM });
      notify("success", "任务已创建，现在可以启动抓取。");
    } catch (error) {
      notify("error", `创建失败：${errorText(error)}`);
    }
  };
  const startTask = async (taskId) => {
    if (runningTaskId && runningTaskId !== taskId) return notify("error", `已有任务 ${runningTaskId.slice(0, 8)} 正在运行。`);
    try {
      await axios.post(`${API}/start/${taskId}`);
      if (socketRef.current) socketRef.current.emit("join", { room: taskId });
      await fetchStatus(taskId);
      setViewMode("logs");
      notify("success", "任务已启动，正在接收实时日志。");
    } catch (error) {
      notify("error", `启动失败：${errorText(error)}`);
    }
  };
  const callAction = async (path, message) => {
    try {
      await axios.post(`${API}/${path}/${selectedTaskId}`);
      await fetchStatus(selectedTaskId);
      notify("success", message);
    } catch (error) {
      notify("error", errorText(error));
    }
  };
  const saveConfig = async () => {
    try {
      await axios.post(`${API}/config/${selectedTaskId}`, editConfig);
      setTasks((prev) => prev.map((task) => task.id === selectedTaskId ? { ...task, config: { ...(task.config || {}), ...editConfig } } : task));
      notify("success", "暂停配置已更新。");
    } catch (error) {
      notify("error", `更新失败：${errorText(error)}`);
    }
  };
  const exportResults = async () => {
    try {
      const response = await axios.get(`${API}/export/${selectedTaskId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `crawl_results_${selectedTaskId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      notify("error", `导出失败：${errorText(error)}`);
    }
  };

  return (
    <div className="crawler-app">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <h1>CrawlFlow</h1>
            <p>任务、日志和结果放在同一个工作台里，方便课设演示和调试。</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => setSelectedTaskId(null)}>新建</button>
        </div>
        <div className="sidebar-card">
          <div><span>任务总数</span><strong>{tasks.length}</strong></div>
          <div><span>运行中</span><strong>{runningCount}</strong></div>
        </div>
        <h2>任务列表</h2>
        <div className="task-list">
          {orderedTasks.length ? orderedTasks.map((task) => {
            const taskStatus = taskStatuses[task.id]?.status || task.status || STATUS.PENDING;
            return (
              <button key={task.id} type="button" className={`task-item ${selectedTaskId === task.id ? "active" : ""}`} onClick={() => setSelectedTaskId(task.id)}>
                <div className="task-head">
                  <span className="task-name">{taskNameOf(task.name, task.id) || task.id.slice(0, 8)}</span>
                  <span className={`task-dot ${taskStatus.toLowerCase()}`} />
                </div>
                <div className="task-meta">
                  <span>{hostOf(task.start_url || task.config?.start_url)}</span>
                  <span>{timeText(task.createdAt)}</span>
                </div>
              </button>
            );
          }) : <div className="empty-side">还没有任务。先创建一个，再回到这里查看状态。</div>}
        </div>
      </aside>

      <main className="main-panel">
        {notice ? <div className={`notice ${notice.type}`}>{notice.message}</div> : null}

        {!selectedTaskId ? (
          <section className="workspace">
            <div className="page-head">
              <div>
                <h2>创建任务</h2>
                <p>先定义抓取范围和策略。创建成功后不会自动启动。</p>
              </div>
            </div>
            <div className="create-layout">
              <form className="panel form-panel" onSubmit={submitTask}>
                <div className="field span-2">
                  <label>任务名称</label>
                  <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例如：课程资料站点抓取" />
                </div>
                <div className="field span-2">
                  <label>起始 URL</label>
                  <input value={formData.start_url} onChange={(e) => setFormData({ ...formData, start_url: e.target.value })} onBlur={() => !formData.allow_domains && setFormData((prev) => ({ ...prev, allow_domains: domainsOf(prev.start_url).join(", ") }))} required placeholder="https://example.com, https://docs.example.com" />
                  <small>支持多个入口，逗号分隔；失焦后会尝试自动填充允许域名。</small>
                </div>
                <div className="field span-2">
                  <label>允许域名</label>
                  <input value={formData.allow_domains} onChange={(e) => setFormData({ ...formData, allow_domains: e.target.value })} placeholder="example.com, docs.example.com" />
                </div>
                <div className="field">
                  <label>策略</label>
                  <select value={formData.strategy} onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}>
                    <option value="BFS">BFS</option>
                    <option value="DFS">DFS</option>
                    <option value="BIG_SITE_FIRST">大站优先</option>
                  </select>
                  <small>{STRATEGY_TEXT[formData.strategy]}</small>
                </div>
                <div className="field">
                  <label>最大深度</label>
                  <input type="number" min="1" value={formData.max_depth} onChange={(e) => setFormData({ ...formData, max_depth: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>最大页面数</label>
                  <input type="number" min="1" value={formData.max_pages} onChange={(e) => setFormData({ ...formData, max_pages: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>请求间隔（秒）</label>
                  <input type="number" min="0" step="0.1" value={formData.interval} onChange={(e) => setFormData({ ...formData, interval: Number(e.target.value) })} />
                </div>
                {formData.strategy === "BIG_SITE_FIRST" ? <>
                  <div className="field span-2">
                    <label>重点域名</label>
                    <input value={formData.priority_domains} onChange={(e) => setFormData({ ...formData, priority_domains: e.target.value })} placeholder="quotes.toscrape.com" />
                  </div>
                  <div className="field span-2">
                    <label>黑名单域名</label>
                    <input value={formData.blacklist} onChange={(e) => setFormData({ ...formData, blacklist: e.target.value })} placeholder="ads.example.com" />
                  </div>
                </> : null}
                <div className="form-actions span-2">
                  <button type="button" className="secondary-btn" onClick={() => setFormData({ ...DEFAULT_FORM })}>重置</button>
                  <button type="submit" className="primary-btn">创建任务</button>
                </div>
              </form>

              <aside className="panel template-panel">
                <div>
                  <h3>预设样例</h3>
                  <p>来自 README 的测试场景，可以一键带入。</p>
                </div>
                <div className="template-list">
                  {TEMPLATES.map((template) => (
                    <button key={template.name} type="button" className="template-card" onClick={() => { setFormData({ ...template.data }); setSelectedTaskId(null); notify("success", `已载入预设：${template.name}`); }}>
                      <strong>{template.name}</strong>
                      <span>{template.hint}</span>
                      <small>{hostOf(template.data.start_url)}</small>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        ) : (
          <section className="workspace">
            <div className="page-head detail-head">
              <div>
                <h2>{taskNameOf(selectedTask?.name || status?.name, selectedTaskId)}</h2>
                <p>任务 ID：{selectedTaskId} · 创建时间：{timeText(selectedTask?.createdAt)}</p>
              </div>
              <div className="toolbar">
                <button className="secondary-btn" type="button" onClick={() => setSelectedTaskId(null)}>新建任务</button>
                <button className="primary-btn" type="button" onClick={() => startTask(selectedTaskId)} disabled={[STATUS.RUNNING, STATUS.PAUSED].includes(status?.status)}>启动</button>
                <button className="secondary-btn" type="button" onClick={() => callAction("pause", "任务已暂停。")} disabled={status?.status !== STATUS.RUNNING}>暂停</button>
                <button className="secondary-btn" type="button" onClick={() => callAction("resume", "任务已继续执行。")} disabled={status?.status !== STATUS.PAUSED}>继续</button>
                <button className="secondary-btn" type="button" onClick={() => callAction("stop", "已发送停止指令。")} disabled={[STATUS.STOPPED, STATUS.COMPLETED, STATUS.FAILED].includes(status?.status)}>停止</button>
              </div>
            </div>

            <div className="summary-strip panel">
              <div><span>已访问</span><strong>{status?.visited_count || 0}</strong></div>
              <div><span>结果</span><strong>{status?.result_count ?? taskResults.length}</strong></div>
              <div><span>队列</span><strong>{status?.queue_size || 0}</strong></div>
              <div><span>深度</span><strong>{status?.current_depth || 0}</strong></div>
            </div>

            <div className="detail-layout">
              <section className="panel content-panel">
                <div className="panel-bar">
                  <div className="tabs">
                    <button type="button" className={viewMode === "logs" ? "active" : ""} onClick={() => setViewMode("logs")}>日志</button>
                    <button type="button" className={viewMode === "results" ? "active" : ""} onClick={() => { setViewMode("results"); if (!taskResults.length) fetchResults(selectedTaskId).catch(() => null); }}>结果</button>
                  </div>
                  <div className="panel-tools">
                    {viewMode === "results" ? <button className="secondary-btn" type="button" onClick={exportResults} disabled={!taskResults.length}>导出 Excel</button> : null}
                    <span>{viewMode === "logs" ? `${taskLogs.length} 条日志` : `${status?.result_count ?? taskResults.length} 条结果`}</span>
                  </div>
                </div>
                {viewMode === "logs" ? <LogViewer logs={taskLogs} /> : <ResultViewer results={taskResults} />}
              </section>

              <aside className="panel inspector">
                <section>
                  <div className="inspector-head">
                    <h3>任务状态</h3>
                    <StatusBadge status={status?.status || STATUS.PENDING} />
                  </div>
                  <div className="mini-grid">
                    <div><span>任务简称</span><strong>{selectedTaskId.slice(0, 8)}</strong></div>
                    <div><span>运行中任务</span><strong>{runningCount}</strong></div>
                  </div>
                </section>

                <section>
                  <h3>抓取配置</h3>
                  <dl className="meta-list">
                    <div><dt>起始 URL</dt><dd>{taskConfig.start}</dd></div>
                    <div><dt>策略</dt><dd>{taskConfig.strategy}</dd></div>
                    <div><dt>允许域名</dt><dd>{taskConfig.allow}</dd></div>
                    <div><dt>最大深度</dt><dd>{taskConfig.depth}</dd></div>
                    <div><dt>最大页面数</dt><dd>{taskConfig.pages}</dd></div>
                    <div><dt>请求间隔</dt><dd>{taskConfig.interval}</dd></div>
                    {selectedTask?.config?.strategy === "BIG_SITE_FIRST" ? <>
                      <div><dt>重点域名</dt><dd>{taskConfig.priority}</dd></div>
                      <div><dt>黑名单</dt><dd>{taskConfig.blacklist}</dd></div>
                    </> : null}
                  </dl>
                  {!selectedTask?.config ? <p className="tip">历史任务只返回了部分字段，所以配置可能不完整。</p> : null}
                </section>

                {status?.status === STATUS.PAUSED ? (
                  <section>
                    <h3>暂停后调整</h3>
                    <div className="edit-grid">
                      <label><span>请求间隔</span><input type="number" min="0" step="0.1" value={editConfig.interval} onChange={(e) => setEditConfig({ ...editConfig, interval: Number(e.target.value) })} /></label>
                      <label><span>最大页面数</span><input type="number" min="1" value={editConfig.max_pages} onChange={(e) => setEditConfig({ ...editConfig, max_pages: Number(e.target.value) })} /></label>
                      <label><span>最大深度</span><input type="number" min="1" value={editConfig.max_depth} onChange={(e) => setEditConfig({ ...editConfig, max_depth: Number(e.target.value) })} /></label>
                    </div>
                    <button className="primary-btn full-btn" type="button" onClick={saveConfig}>保存暂停配置</button>
                    <p className="tip">保存后点击“继续”即可按新参数运行。</p>
                  </section>
                ) : null}
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default CrawlerMain;
