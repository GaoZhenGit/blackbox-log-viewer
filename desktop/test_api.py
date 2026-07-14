"""Tests for api.py — all methods must raise NotImplementedError with a message that includes 'future spec'."""

import pytest
from api import Api


def test_open_file_dialog_not_implemented():
    api = Api()
    with pytest.raises(NotImplementedError, match="future spec"):
        api.open_file_dialog()


def test_save_file_dialog_not_implemented():
    api = Api()
    with pytest.raises(NotImplementedError, match="future spec"):
        api.save_file_dialog("test.csv")


def test_export_video_not_implemented():
    api = Api()
    with pytest.raises(NotImplementedError, match="future spec"):
        api.export_video([], None, "out.webm", {})
