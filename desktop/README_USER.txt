Blackbox Explorer - Desktop Edition
====================================

系统要求：
  - Windows 10 version 1809 或更高版本
  - WebView2 Runtime（如果缺失，首次运行时会自动安装）

使用方法：
  1. 解压本 zip 包到任意目录
  2. 双击 BlackboxExplorer.exe
  3. 在窗口中点击"Open log file/video"或拖放 .bbl/.bfl 文件
  4. 使用图表分析飞行数据

导出：
  - CSV/GPX 导出通过浏览器下载机制保存
  - 视频导出功能将在后续版本中提供

故障排除：
  - 如果程序无法启动，请检查 crash.log（与 exe 在同目录）
  - 如果提示"找不到前端文件"，请确保 dist/ 目录与 exe 在同一位置

项目地址：https://github.com/betaflight/blackbox-log-viewer
