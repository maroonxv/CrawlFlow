# 参与贡献指南

感谢你愿意花时间改进 CrawlFlow。

## 开始之前

- 如果是缺陷反馈、较大的改动，或新功能提案，请先提交一个 Issue。
- 尽量让改动聚焦单一目标，优先提交体量适中、便于评审的 Pull Request。
- 只要行为发生变化，就请同步更新文档与测试。

## 开发环境准备

### 后端

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 推荐工作流

1. 从 `main` 创建新的分支。
2. 用尽可能小且清晰的改动解决问题。
3. 运行与本次改动相关的测试。
4. 如果命令、行为或架构发生变化，请同步更新文档。
5. 提交 Pull Request，并附上简明摘要与验证说明。

## Pull Request 检查清单

- 本次改动的原因和范围清晰明确。
- 新增或变更的行为在可行时已通过测试覆盖。
- 文档、示例与环境说明保持准确。
- 不包含密钥、本地日志或构建产物。

## 提交信息建议

- 优先使用语义清晰、可读性好的提交说明。
- 修复缺陷时，不要顺手混入无关重构。
- 如有对应 Issue，请在提交说明中关联编号。

## 仓库分区说明

- `backend/`：Flask API、爬虫编排、领域模型与持久化实现。
- `frontend/`：React 控制台与界面交互行为。
- `docs/`：设计文档、项目记录与命令参考。
- `tests/`：仓库级回归测试覆盖。

## 需要帮助？

请提交一个包含上下文、预期行为，以及你已经尝试过哪些步骤的 Issue。
