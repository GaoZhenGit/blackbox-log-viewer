# Blackbox Explorer — Desktop Wrapper

## 环境设置

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\pip install pyinstaller
```

## 开发运行

```powershell
# 先构建前端
yarn build
# 或：npm run build

# 运行桌面包装
.venv\Scripts\python main.py
```

## 构建分发包

```powershell
.venv\Scripts\python build_exe.py
```

产物在 `build/blackbox-explorer-v{版本}.zip`。

## 文件说明

| 文件 | 用途 |
|---|---|
| `main.py` | 入口：WebView2 安装 → 路径解析 → 窗口 |
| `api.py` | js_api 桥接类（预留，当前均为 NotImplementedError） |
| `webview_bootstrap.spec` | PyInstaller 打包配置 |
| `build_exe.py` | 一键构建脚本 |
| `MicrosoftEdgeWebview2Setup.exe` | WebView2 离线安装程序（构建前需下载） |
