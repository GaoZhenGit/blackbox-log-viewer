import { FlightLogGrapher } from "./grapher";

export function FlightLogVideoRenderer(
  flightLog,
  logParameters,
  videoOptions,
  events
) {
  let WORK_CHUNK_SIZE_FOCUSED = 8,
    WORK_CHUNK_SIZE_UNFOCUSED = 32,
    canvas = document.createElement("canvas"),
    stickCanvas = document.createElement("canvas"),
    craftCanvas = document.createElement("canvas"),
    analyserCanvas = document.createElement("canvas"),
    stickCanvasLeft,
    stickCanvasTop,
    craftCanvasLeft,
    craftCanvasTop,
    analyserCanvasLeft,
    analyserCanvasTop,
    canvasContext = canvas.getContext("2d", { willReadFrequently: true }),
    frameCount,
    frameDuration,
    frameTime,
    frameIndex,
    cancel = false,
    workChunkSize = WORK_CHUNK_SIZE_FOCUSED,
    hidden,
    visibilityChange,
    graph;

  if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
  } else if (typeof document.mozHidden !== "undefined") {
    hidden = "mozHidden";
    visibilityChange = "mozvisibilitychange";
  } else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
  } else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
  }

  function handleVisibilityChange() {
    if (document[hidden]) {
      workChunkSize = WORK_CHUNK_SIZE_UNFOCUSED;
    } else {
      workChunkSize = WORK_CHUNK_SIZE_FOCUSED;
    }
  }

  function installVisibilityHandler() {
    if (typeof document[hidden] !== "undefined") {
      document.addEventListener(visibilityChange, handleVisibilityChange, false);
    }
  }

  function removeVisibilityHandler() {
    if (typeof document[hidden] !== "undefined") {
      document.removeEventListener(visibilityChange, handleVisibilityChange);
    }
  }

  function notifyCompletion(success, frameCount) {
    removeVisibilityHandler();
    if (window.electronAPI) {
      window.electronAPI.removeExportListeners();
    }
    if (events && events.onComplete) {
      events.onComplete(success, frameCount);
    }
  }

  function renderChunk() {
    let framesToRender = Math.min(workChunkSize, frameCount - frameIndex);

    if (cancel) {
      if (window.electronAPI) {
        window.electronAPI.exportVideoCancel();
      }
      notifyCompletion(false);
      return;
    }

    let chunkStart = performance.now(),
      completeChunk = function () {
        let elapsed = performance.now() - chunkStart;
        if (frameIndex > 0) {
          console.log('[Renderer] chunk done:', framesToRender, 'frames in', elapsed.toFixed(0), 'ms =',
            (elapsed / framesToRender).toFixed(1), 'ms/frame');
        }
        if (events && events.onProgress) {
          events.onProgress(frameIndex, frameCount);
        }
        if (frameIndex >= frameCount) {
          console.log('[Renderer] all frames done, total:', frameIndex);
          if (window.electronAPI) {
            window.electronAPI.exportVideoCancel();
          }
          notifyCompletion(true, frameIndex);
        } else {
          setTimeout(renderChunk, 0);
        }
      },
      renderFrame = function () {
        graph.render(frameTime);

        if (logParameters.hasSticks && parseInt(userSettings.sticks.size) > 0)
          canvasContext.drawImage(stickCanvas, stickCanvasLeft, stickCanvasTop);
        if (logParameters.hasCraft && parseInt(userSettings.craft.size) > 0)
          canvasContext.drawImage(craftCanvas, craftCanvasLeft, craftCanvasTop);
        if (
          logParameters.hasAnalyser &&
          parseInt(userSettings.analyser.size) > 0
        )
          canvasContext.drawImage(
            analyserCanvas,
            analyserCanvasLeft,
            analyserCanvasTop
          );

        if (window.electronAPI) {
          let t0 = performance.now();
          const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
          let t1 = performance.now();
          window.electronAPI.sendFrame(imageData.data.buffer.slice(0));
          let t2 = performance.now();
          if (frameIndex === 0 || frameIndex % 30 === 0) {
            console.log('[Renderer] frame', frameIndex,
              'getImageData:', (t1 - t0).toFixed(1), 'ms',
              'sendFrame:', (t2 - t1).toFixed(1), 'ms');
          }
        }

        frameIndex++;
        frameTime += frameDuration;
      };

    if (logParameters.flightVideo) {
      let renderFrames = function (remaining) {
        if (remaining === 0) {
          completeChunk();
          return;
        }

        logParameters.flightVideo.onseeked = function () {
          canvasContext.drawImage(
            logParameters.flightVideo,
            0, 0,
            videoOptions.width, videoOptions.height
          );

          if (videoOptions.videoDim > 0) {
            canvasContext.fillStyle = `rgba(0,0,0,${videoOptions.videoDim})`;
            canvasContext.fillRect(0, 0, canvas.width, canvas.height);
          }

          renderFrame();
          renderFrames(remaining - 1);
        };

        logParameters.flightVideo.currentTime =
          (frameTime - flightLog.getMinTime()) / 1000000 +
          (logParameters.flightVideoOffset || 0);
      };

      renderFrames(framesToRender);
    } else {
      for (let i = 0; i < framesToRender; i++) {
        renderFrame();
      }
      completeChunk();
    }
  }

  this.cancel = function () {
    cancel = true;
  };

  this.start = function () {
    cancel = false;
    frameTime = logParameters.inTime;
    frameIndex = 0;
    installVisibilityHandler();
    renderChunk();
  };

  this.getWrittenSize = function () {
    return 0;
  };

  this.willWriteDirectToDisk = function () {
    return true;
  };

  canvas.width = videoOptions.width;
  canvas.height = videoOptions.height;

  if (videoOptions.videoDim >= 1.0) {
    delete logParameters.flightVideo;
  }

  let options = $.extend({}, userSettings || {}, {
    eraseBackground: true,
    drawEvents: false,
    fillBackground: false,
  });

  graph = new FlightLogGrapher(
    flightLog,
    logParameters.graphConfig,
    canvas,
    stickCanvas,
    craftCanvas,
    analyserCanvas,
    options
  );

  stickCanvasLeft = parseInt($(stickCanvas).css("left"), 10);
  stickCanvasTop = parseInt($(stickCanvas).css("top"), 10);
  craftCanvasLeft = parseInt($(craftCanvas).css("left"), 10);
  craftCanvasTop = parseInt($(craftCanvas).css("top"), 10);
  analyserCanvasLeft = parseInt($(analyserCanvas).css("left"), 10);
  analyserCanvasTop = parseInt($(analyserCanvas).css("top"), 10);

  if (!("inTime" in logParameters) || logParameters.inTime === false) {
    logParameters.inTime = flightLog.getMinTime();
  }
  if (!("outTime" in logParameters) || logParameters.outTime === false) {
    logParameters.outTime = flightLog.getMaxTime();
  }

  frameDuration = 1000000 / videoOptions.frameRate;
  frameCount = Math.round(
    (logParameters.outTime - logParameters.inTime) / frameDuration
  );

  if (logParameters.flightVideo) {
    logParameters.flightVideo.muted = true;
  }
}

FlightLogVideoRenderer.isSupported = function () {
  return true;
};
