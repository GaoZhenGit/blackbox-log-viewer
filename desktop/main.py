"""Blackbox Explorer desktop entry point.

Bootstraps WebView2, serves the frontend via pywebview's built-in HTTP server,
and creates the main window.
"""

import ctypes
import logging
import sys
from ctypes import wintypes
from pathlib import Path

import webview
from api import Api

APP_NAME = "Blackbox Explorer"
MUTEX_NAME = r"Global\BlackboxExplorer_SingleInstance"


# ---------------------------------------------------------------------------
# Win32 helpers (ctypes-only, no pywin32 dependency)
# ---------------------------------------------------------------------------

_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

_CreateMutexW = _kernel32.CreateMutexW
_CreateMutexW.argtypes = [wintypes.LPCVOID, wintypes.BOOL, wintypes.LPCWSTR]
_CreateMutexW.restype = wintypes.HANDLE

_MessageBoxW = ctypes.windll.user32.MessageBoxW
_MessageBoxW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT]
_MessageBoxW.restype = ctypes.c_int

ERROR_ALREADY_EXISTS = 183
MB_ICONERROR = 0x10
MB_ICONWARNING = 0x30


def _msgbox(text: str, title: str = APP_NAME, icon: int = MB_ICONERROR) -> None:
    _MessageBoxW(0, text, title, icon)


# ---------------------------------------------------------------------------
# Single-instance check
# ---------------------------------------------------------------------------

def check_single_instance() -> None:
    """Ensure only one instance runs. Exit if another is already running."""
    _CreateMutexW(None, False, MUTEX_NAME)
    if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
        _msgbox("程序已在运行中", icon=MB_ICONWARNING)
        sys.exit(1)


# ---------------------------------------------------------------------------
# WebView2 detection & bootstrapping
# ---------------------------------------------------------------------------

def _webview2_installed() -> bool:
    """Check Windows registry for the Evergreen WebView2 Runtime."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        )
        winreg.QueryValueEx(key, "pv")
        winreg.CloseKey(key)
        return True
    except OSError:
        return False


def _get_bootstrapper_path() -> Path:
    """Get path to embedded WebView2 evergreen bootstrapper."""
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).parent
    return base / "MicrosoftEdgeWebview2Setup.exe"


def ensure_webview2() -> None:
    """Install WebView2 Runtime if missing."""
    if _webview2_installed():
        logging.info("WebView2 Runtime detected")
        return

    logging.warning("WebView2 Runtime not found, starting bootstrapper")
    bootstrapper = _get_bootstrapper_path()
    if not bootstrapper.is_file():
        logging.error("WebView2 bootstrapper not found: %s", bootstrapper)
        _msgbox("WebView2 运行库安装失败——找不到安装程序\n请手动下载: https://go.microsoft.com/fwlink/p/?LinkId=2124703")
        sys.exit(1)

    import subprocess
    result = subprocess.run(
        [str(bootstrapper), "/silent", "/install"],
        capture_output=True,
        timeout=120,
    )
    if result.returncode == 0 and _webview2_installed():
        logging.info("WebView2 Runtime installed successfully")
    else:
        logging.error("WebView2 installation failed (exit %d): %s", result.returncode, result.stderr)
        _msgbox("WebView2 运行库安装失败\n请手动下载: https://go.microsoft.com/fwlink/p/?LinkId=2124703")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

def get_app_dir() -> Path:
    """Root directory containing the exe (production) or project root (dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    else:
        # Running as python desktop/main.py → project root is desktop/../
        return Path(__file__).resolve().parent.parent


def get_dist_dir(app_dir: Path) -> Path | None:
    """Locate the frontend dist/ directory."""
    candidate = app_dir / "dist"
    if candidate.is_dir():
        return candidate
    return None


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def setup_logging(app_dir: Path) -> None:
    log_path = app_dir / "crash.log"
    logging.basicConfig(
        filename=str(log_path),
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    app_dir = get_app_dir()
    setup_logging(app_dir)
    logging.info("=== Blackbox Explorer starting ===")

    check_single_instance()
    ensure_webview2()

    dist_dir = get_dist_dir(app_dir)
    if not dist_dir:
        logging.error("dist/ directory not found in %s", app_dir)
        _msgbox("找不到前端文件，请检查 dist/ 目录是否与程序在同一位置")
        sys.exit(1)

    logging.info("Serving frontend from %s", dist_dir)

    api = Api()
    webview.create_window(
        title=APP_NAME,
        url=str(dist_dir / "index.html"),
        width=1280,
        height=800,
        resizable=True,
        js_api=api,
    )

    try:
        webview.start(http_server=True)
    except Exception:
        logging.exception("Fatal error during webview start")
        _msgbox("程序启动失败，请查看 crash.log")
        sys.exit(1)


if __name__ == "__main__":
    main()
