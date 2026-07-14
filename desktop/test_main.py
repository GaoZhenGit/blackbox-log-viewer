"""Tests for main.py path resolution and bootstrap logic (no GUI needed)."""

from pathlib import Path

import pytest

from main import get_app_dir, get_dist_dir, _webview2_installed


class TestGetAppDir:
    def test_dev_mode_returns_project_root(self, monkeypatch):
        monkeypatch.setattr("main.sys.frozen", False, raising=False)
        fake_file = Path("/fake/project/desktop/main.py").resolve()
        monkeypatch.setattr("main.__file__", str(fake_file))
        result = get_app_dir()
        assert result == fake_file.parent.parent


class TestGetDistDir:
    def test_found(self, tmp_path):
        (tmp_path / "dist").mkdir()
        result = get_dist_dir(tmp_path)
        assert result == tmp_path / "dist"

    def test_not_found(self, tmp_path):
        result = get_dist_dir(tmp_path)
        assert result is None

    def test_dist_is_file_not_dir(self, tmp_path):
        (tmp_path / "dist").write_text("not a dir")
        result = get_dist_dir(tmp_path)
        assert result is None


class TestWebView2Installed:
    def test_returns_bool(self):
        result = _webview2_installed()
        assert isinstance(result, bool)
