# 开发命令速查

## 虚拟环境中的 Python

```powershell
scraping_app_v0\backend\.venv\Scripts\python.exe
```

## 启动后端 Flask 服务

```powershell
scraping_app_v0\backend\.venv\Scripts\python.exe scraping_app_v0\backend\run.py
```

## 启动前端 React 服务

```powershell
cd scraping_app_v0/frontend
npm run dev
```

## 激活虚拟环境

```powershell
scraping_app_v0\backend\.venv\Scripts\activate.ps1
```

## 运行测试前的示例命令

```powershell
scraping_app_v0\backend\.venv\Scripts\python.exe -m pytest scraping_app_v0\backend\test\unit\test_http_client_impl.py
```
