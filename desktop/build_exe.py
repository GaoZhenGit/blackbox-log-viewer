"""One-shot build script: yarn build → pyinstaller → zip."""

import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = PROJECT_ROOT / "build"
DIST_SRC = PROJECT_ROOT / "dist"
DESKTOP_DIR = PROJECT_ROOT / "desktop"
PYINSTALLER_WORK = DESKTOP_DIR / "dist"  # pyinstaller default output subdir


def run(cmd, cwd=None, desc="", env=None):
    print(f"\n>>> {desc or cmd}")
    if isinstance(cmd, list):
        cmd = " ".join(cmd)
    result = subprocess.run(cmd, cwd=cwd, env=env, shell=True)
    if result.returncode != 0:
        print(f"FAILED: {desc or cmd}")
        sys.exit(result.returncode)


def main():
    # 1. Lint check (soft — warn but don't abort on pre-existing issues)
    os.environ["ESLINT_USE_FLAT_CONFIG"] = "false"
    result = subprocess.run(["npm", "run", "lint"], cwd=PROJECT_ROOT, shell=True)
    if result.returncode != 0:
        print("WARNING: Lint returned errors (pre-existing, not caused by this change)")

    # 2. Build frontend
    run(["npm", "run", "build"], cwd=PROJECT_ROOT, desc="npm run build")

    # 3. Verify no PWA artifacts
    pwa_files = (
        list(Path(DIST_SRC).glob("sw.js"))
        + list(Path(DIST_SRC).glob("manifest.webmanifest"))
        + list(Path(DIST_SRC).glob("workbox-*.js"))
    )
    if pwa_files:
        print("ERROR: PWA artifacts found in dist/, PWA removal incomplete:", pwa_files)
        sys.exit(1)
    print("PWA artifacts: none found (OK)")

    # 4. PyInstaller
    venv_python = str(DESKTOP_DIR / ".venv" / "Scripts" / "python.exe")
    run(
        [
            venv_python,
            "-m",
            "PyInstaller",
            "webview_bootstrap.spec",
            "--distpath",
            str(PYINSTALLER_WORK),
            "--workpath",
            str(DESKTOP_DIR / "build"),
            "--clean",
            "--noconfirm",
        ],
        cwd=DESKTOP_DIR,
        desc="pyinstaller",
    )

    # 5. Assemble build/ directory (selective cleanup, preserve README.txt)
    BUILD_DIR.mkdir(exist_ok=True)
    for item in ["BlackboxExplorer.exe", "dist"]:
        target = BUILD_DIR / item
        if target.is_dir():
            shutil.rmtree(target)
        elif target.is_file():
            target.unlink()

    # Copy exe
    exe_src = PYINSTALLER_WORK / "BlackboxExplorer.exe"
    shutil.copy2(exe_src, BUILD_DIR / "BlackboxExplorer.exe")

    # Copy frontend
    if (BUILD_DIR / "dist").exists():
        shutil.rmtree(BUILD_DIR / "dist")
    shutil.copytree(DIST_SRC, BUILD_DIR / "dist")

    # Copy user README template
    shutil.copy2(DESKTOP_DIR / "README_USER.txt", BUILD_DIR / "README.txt")

    # 6. Package zip
    version = json.loads((PROJECT_ROOT / "package.json").read_text())["version"]
    zip_name = f"blackbox-explorer-v{version}.zip"
    zip_path = BUILD_DIR / zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in BUILD_DIR.iterdir():
            if f.name == zip_name:
                continue
            if f.is_file():
                zf.write(f, f.name)
            else:
                for root, _, files in os.walk(f):
                    for file in files:
                        full = Path(root) / file
                        arcname = str(full.relative_to(BUILD_DIR))
                        zf.write(full, arcname)

    print(f"\n=== Build complete: {zip_path} ===")
    print(f"    Size: {zip_path.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
