# 仓库级测试说明

此目录用于存放跨越多个包边界的测试，而不是仅针对单个子项目的内部测试。

## 当前内容

- `integration/test_realtime_logging_backend.py`：覆盖后端实时日志链路的回归测试。

## 运行方式

```bash
python -m pytest tests
```

未来若新增端到端测试或跨包回归测试，且它们不只属于 `backend/test/` 或 `frontend/test/`，都应放在这里。
