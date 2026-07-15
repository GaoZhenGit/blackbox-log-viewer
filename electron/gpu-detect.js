const { spawnSync } = require('child_process');
const { app } = require('electron');
const path = require('path');

function getFfmpegPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe');
  }
  return path.join(__dirname, '..', 'bin', 'ffmpeg.exe');
}

const ENCODERS = [
  { name: 'NVIDIA NVENC H.264', key: 'nvenc', encoder: 'h264_nvenc' },
  { name: 'Intel QSV H.264', key: 'qsv', encoder: 'h264_qsv' },
  { name: 'AMD AMF H.264', key: 'amf', encoder: 'h264_amf' },
  { name: 'CPU libx264', key: 'software', encoder: 'libx264' },
];

function detectEncoder() {
  const ffmpegPath = getFfmpegPath();

  for (const enc of ENCODERS) {
    if (enc.key === 'software') {
      return enc;
    }

    const result = spawnSync(ffmpegPath, [
      '-f', 'lavfi',
      '-i', 'color=black:s=64x64:r=1',
      '-frames:v', '1',
      '-c:v', enc.encoder,
      '-f', 'null',
      '-',
    ], { timeout: 5000 });

    if (result.status === 0) {
      return enc;
    }
  }

  return ENCODERS[ENCODERS.length - 1];
}

module.exports = { detectEncoder, ENCODERS };
