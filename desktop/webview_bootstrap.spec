# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

_DESKTOP_DIR = Path(SPECPATH)
_PROJECT_ROOT = _DESKTOP_DIR.parent

a = Analysis(
    ['main.py'],
    pathex=[_DESKTOP_DIR],
    binaries=[],
    datas=[('MicrosoftEdgeWebview2Setup.exe', '.')],
    hiddenimports=[
        'webview.platforms.edgechromium',
        'webview.guilib',
        'bottle',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='BlackboxExplorer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=str(_PROJECT_ROOT / 'public' / 'images' / 'pwa' / 'bf_icon_256.png'),
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
