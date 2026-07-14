"""js_api bridge exposed to frontend via window.pywebview.api.

All methods raise NotImplementedError — they are reserved for future specs.
"""


class Api:

    def open_file_dialog(self, file_types=()):
        """Native open file dialog (future)."""
        raise NotImplementedError("future spec")

    def save_file_dialog(self, suggested_name, file_types=()):
        """Native save file dialog (future)."""
        raise NotImplementedError("future spec")

    def export_video(self, frames, audio_file, output_path, options):
        """ffmpeg video export via PyAV (future)."""
        raise NotImplementedError("future spec")
