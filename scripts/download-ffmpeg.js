const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { path7za } = require('7zip-bin');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const FFMPEG_EXE = path.join(BIN_DIR, 'ffmpeg.exe');
const FFPROBE_EXE = path.join(BIN_DIR, 'ffprobe.exe');
const DOWNLOAD_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.7z';
const TEMP_FILE = path.join(BIN_DIR, 'ffmpeg.7z');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    // Use curl if available (respects http_proxy env), otherwise https.get
    const useCurl = process.env.USE_CURL !== 'false';

    if (useCurl) {
      console.log(`Downloading via curl: ${url}`);
      try {
        execFileSync('curl', ['-L', '--progress-bar', '-o', dest, url], {
          stdio: 'inherit',
          timeout: 600000,
        });
        console.log('  Done.');
        resolve();
      } catch (e) {
        reject(new Error(`curl failed: ${e.message}`));
      }
      return;
    }

    // Fallback: https.get
    console.log(`Downloading ${url} ...`);
    const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
    let getModule;
    let options = url;

    if (proxyUrl && url.startsWith('https://')) {
      // Use node https directly with proxy via env
    }

    const https = require('https');
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(res.headers['content-length'], 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total) process.stdout.write(`\r  ${(downloaded / total * 100).toFixed(0)}%`);
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log('\r  Done.'); resolve(); });
    }).on('error', reject);
  });
}

function extract(src, destDir) {
  console.log('Extracting...');
  execFileSync(path7za, ['x', src, '-y'], { cwd: destDir, stdio: 'ignore' });
  const dirs = fs.readdirSync(destDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('ffmpeg-'));
  if (dirs.length === 1) {
    const subBin = path.join(destDir, dirs[0].name, 'bin');
    fs.copyFileSync(path.join(subBin, 'ffmpeg.exe'), FFMPEG_EXE);
    fs.copyFileSync(path.join(subBin, 'ffprobe.exe'), FFPROBE_EXE);
    fs.rmSync(path.join(destDir, dirs[0].name), { recursive: true, force: true });
  }
  fs.unlinkSync(src);
  console.log('ffmpeg.exe & ffprobe.exe ready.');
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  if (fs.existsSync(FFMPEG_EXE) && fs.existsSync(FFPROBE_EXE)) {
    console.log('ffmpeg already exists, skipping download.');
    return;
  }

  console.log('ffmpeg not found, downloading (one-time ~32MB)...');
  try {
    await download(DOWNLOAD_URL, TEMP_FILE);
    extract(TEMP_FILE, BIN_DIR);
  } catch (err) {
    console.error('Download failed:', err.message);
    console.error('Please manually download from', DOWNLOAD_URL);
    console.error('Extract ffmpeg.exe and ffprobe.exe into bin/');
    if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
    process.exit(1);
  }
}

main();
