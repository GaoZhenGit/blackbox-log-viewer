const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');

function getFfmpegPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe');
  }
  return path.join(__dirname, '..', 'bin', 'ffmpeg.exe');
}

function getFfprobePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe');
  }
  return path.join(__dirname, '..', 'bin', 'ffprobe.exe');
}

function startExport(config, onProgress, onComplete) {
  const {
    width, height, frameRate,
    encoder, bitrate, gop,
    outputPath,
    videoSourcePath,
  } = config;

  const args = [];

  // Input 0: background video (if available)
  if (videoSourcePath) {
    args.push('-i', videoSourcePath);
  }

  // Input 1: stdin raw RGBA foreground
  args.push(
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-r', String(frameRate),
    '-i', '-'
  );

  // Filter: overlay foreground on background, or just copy
  if (videoSourcePath) {
    args.push('-filter_complex',
      '[0:v]setpts=PTS-STARTPTS[bg];' +
      '[1:v]setpts=PTS-STARTPTS[fg];' +
      '[bg][fg]overlay=format=auto[out]');
    args.push('-map', '[out]');
  } else {
    args.push('-map', '0:v');
  }

  args.push('-c:v', encoder);
  if (bitrate) args.push('-b:v', String(bitrate));
  if (gop) args.push('-g', String(gop));
  args.push('-pix_fmt', 'yuv420p');
  args.push('-y', outputPath);

  console.log('[ffmpeg] start:', getFfmpegPath(), args.join(' '));

  const ffmpeg = spawn(getFfmpegPath(), args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  ffmpeg.on('error', (err) => {
    onComplete(new Error(`ffmpeg failed to start: ${err.message}`));
  });

  let lastTime = 0;

  ffmpeg.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      const sec = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60
        + parseInt(match[3]) + parseInt(match[4]) / 100;
      if (sec > lastTime) {
        lastTime = sec;
        onProgress({ time: sec });
      }
    }
  });

  ffmpeg.on('close', (code) => {
    if (code === 0 || code === null) {
      onComplete(null);
    } else {
      onComplete(new Error(`ffmpeg exited with code ${code}`));
    }
  });

  return {
    writeFrame(buffer) {
      if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.write(Buffer.from(buffer));
      }
    },
    cancel() {
      if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.end();
      }
    },
  };
}

function probeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(getFfprobePath(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      videoPath,
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (d) => { stdout += d.toString(); });
    ffprobe.on('error', reject);
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const vs = info.streams.find((s) => s.codec_type === 'video');
        if (!vs) { resolve(null); return; }
        const [num, den] = (vs.r_frame_rate || '30/1').split('/');
        resolve({
          width: vs.width,
          height: vs.height,
          frameRate: Math.round(parseInt(num) / parseInt(den)),
          bitrate: vs.bit_rate ? parseInt(vs.bit_rate) : null,
          pixFmt: vs.pix_fmt,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { startExport, probeVideo };
