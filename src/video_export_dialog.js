import { FlightLogVideoRenderer } from "./flightlog_video_renderer.js";

export function VideoExportDialog(dialog, onSave) {
  let DIALOG_MODE_SETTINGS = 0,
    DIALOG_MODE_IN_PROGRESS = 1,
    DIALOG_MODE_COMPLETE = 2,
    currentGraphConfig,
    flightLogDataArray,
    dialogMode,
    videoRenderer = false,
    encoderInfo = { name: 'CPU libx264', key: 'software' },
    probedSourceInfo = null,
    videoDuration = $(".video-duration", dialog),
    progressBar = $("progress", dialog),
    progressRenderedFrames = $(".video-export-rendered-frames", dialog),
    progressRemaining = $(".video-export-remaining", dialog),
    progressSize = $(".video-export-size", dialog),
    fileSizeWarning = $(".video-export-size + .alert", dialog),
    renderStartTime,
    lastEstimatedTimeMsec,
    that = this;

  let $dlg = dialog;

  function leftPad(value, pad, width) {
    value = `${value}`;
    while (value.length < width) {
      value = pad + value;
    }
    return value;
  }

  function formatTime(secs) {
    var mins = Math.floor(secs / 60),
      secs = secs % 60,
      hours = Math.floor(mins / 60);
    mins = mins % 60;
    if (hours) {
      return `${hours}:${leftPad(mins, "0", 2)}:${leftPad(secs, "0", 2)}`;
    } else {
      return `${mins}:${leftPad(secs, "0", 2)}`;
    }
  }

  function setDialogMode(mode) {
    dialogMode = mode;
    let settingClasses = [
      "video-export-mode-settings",
      "video-export-mode-progress",
      "video-export-mode-complete",
    ];
    dialog.removeClass(settingClasses.join(" ")).addClass(settingClasses[mode]);
    $(".video-export-dialog-start", $dlg).toggle(mode == DIALOG_MODE_SETTINGS);
    $(".video-export-dialog-cancel", $dlg).toggle(mode != DIALOG_MODE_COMPLETE);
    $(".video-export-dialog-close", $dlg).toggle(mode == DIALOG_MODE_COMPLETE);
    let title = "Export video";
    switch (mode) {
      case DIALOG_MODE_IN_PROGRESS:
        title = "Rendering video...";
        break;
      case DIALOG_MODE_COMPLETE:
        title = "Video rendering complete!";
        break;
    }
    $(".modal-title", $dlg).text(title);
  }

  function populateConfig(videoConfig) {
    if (videoConfig.frameRate) {
      $(".video-frame-rate", $dlg).val(videoConfig.frameRate);
    }
    if (videoConfig.videoDim !== undefined) {
      $(".video-dim option", $dlg).each(function () {
        let thisVal = parseFloat($(this).attr("value"));
        if (Math.abs(videoConfig.videoDim - thisVal) < 0.05) {
          $(".video-dim", $dlg).val($(this).attr("value"));
        }
      });
    }
    if (videoConfig.width) {
      $(".video-resolution", $dlg).val(`${videoConfig.width}x${videoConfig.height}`);
    }
  }

  function convertUIToVideoConfig() {
    let videoConfig = {
        frameRate: parseFloat($(".video-frame-rate", $dlg).val()),
        videoDim: parseFloat($(".video-dim", $dlg).val()),
      },
      resolution;
    resolution = $(".video-resolution", $dlg).val();
    videoConfig.width = parseInt(resolution.split("x")[0], 10);
    videoConfig.height = parseInt(resolution.split("x")[1], 10);
    return videoConfig;
  }

  this.show = function (flightLog, logParameters, videoConfig) {
    exportStarting = false;
    setDialogMode(DIALOG_MODE_SETTINGS);

    if (!("inTime" in logParameters) || logParameters.inTime === false) {
      logParameters.inTime = flightLog.getMinTime();
    }
    if (!("outTime" in logParameters) || logParameters.outTime === false) {
      logParameters.outTime = flightLog.getMaxTime();
    }

    videoDuration.text(
      formatTime(Math.round((logParameters.outTime - logParameters.inTime) / 1000000))
    );

    $(".jumpy-video-note", $dlg).toggle(!!logParameters.flightVideo);

    // --- Electron specific ---
    if (window.electronAPI) {
      window.electronAPI.getEncoderInfo().then(function(info) {
        encoderInfo = info;
        $(".video-encoder-name", $dlg).text(info.name);
        if (info.key === 'software') {
          $(".video-encoder-name", $dlg).append(
            ' <span class="text-warning">(no GPU detected)</span>'
          );
        }
        console.log('[ExportDialog] encoder:', info.name, info.key);
      });

      $(".video-match-source-section", $dlg).toggle(!!logParameters.flightVideo);
      $(".video-match-source", $dlg).prop("checked", false);
      probedSourceInfo = null;

      const videoPath = logParameters.flightVideoPath;
      console.log('[ExportDialog] show, videoPath:', videoPath);

      // Reset controls — use css() for reliable reset
      $(".form-group:has(.video-frame-rate)", $dlg).css('display', '');
      $(".form-group:has(.video-resolution)", $dlg).css('display', '');
      $(".video-probed-info", $dlg).hide().text('');

      $(".video-match-source", $dlg).off("change").on("change", async function() {
        const checked = $(this).is(":checked");
        if (checked) {
          let probePath = videoPath;
          if (!probePath) {
            probePath = await window.electronAPI.openFileDialog({
              title: 'Select the source video file',
              filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mpeg'] }],
            });
            if (!probePath) {
              $(this).prop("checked", false);
              return;
            }
          }

          console.log('[ExportDialog] probing:', probePath);
          $(".video-probed-info", $dlg).show().text("Probing source video...");
          try {
            const info = await window.electronAPI.probeVideo(probePath);
            probedSourceInfo = info;
            if (info) {
              const infoText = `${info.width}x${info.height} @ ${info.frameRate}fps` +
                (info.bitrate ? `, ${Math.round(info.bitrate / 1000000)}Mbps` : '');
              console.log('[ExportDialog] probed:', infoText);
              $(".video-probed-info", $dlg).text(infoText);
              const resStr = `${info.width}x${info.height}`;
              if ($(".video-resolution option[value='" + resStr + "']", $dlg).length) {
                $(".video-resolution", $dlg).val(resStr);
              }
              if ($(".video-frame-rate option[value='" + info.frameRate + "']", $dlg).length) {
                $(".video-frame-rate", $dlg).val(info.frameRate);
              }
            } else {
              $(".video-probed-info", $dlg).text("No video stream found");
            }
          } catch (err) {
            console.error('[ExportDialog] probe failed:', err);
            $(".video-probed-info", $dlg).text("Probe failed: " + err.message);
          }
          // Hide frame rate & resolution; dim stays visible (not a video source param)
          $(".form-group:has(.video-frame-rate)", $dlg).hide();
          $(".form-group:has(.video-resolution)", $dlg).hide();
        } else {
          probedSourceInfo = null;
          $(".video-probed-info", $dlg).hide().text('');
          $(".form-group:has(.video-frame-rate)", $dlg).css('display', '');
          $(".form-group:has(.video-resolution)", $dlg).css('display', '');
        }
      });
    }

    dialog.modal("show");

    this.flightLog = flightLog;
    this.logParameters = logParameters;

    populateConfig(videoConfig);
  };

  let exportStarting = false;

  $(".video-export-dialog-start", $dlg).off("click").click(async function (e) {
    if (exportStarting) return;
    exportStarting = true;

    let videoConfig = convertUIToVideoConfig();
    console.log('[ExportDialog] start, config:', JSON.stringify(videoConfig));
    onSave(videoConfig);

    if (window.electronAPI) {
      const matchSource = $(".video-match-source", $dlg).is(":checked") && that.logParameters.flightVideo;

      if (matchSource && probedSourceInfo) {
        console.log('[ExportDialog] using probed params:', probedSourceInfo);
        if (probedSourceInfo.width && probedSourceInfo.height) {
          videoConfig.width = probedSourceInfo.width;
          videoConfig.height = probedSourceInfo.height;
        }
        if (probedSourceInfo.frameRate) {
          videoConfig.frameRate = probedSourceInfo.frameRate;
        }
        if (probedSourceInfo.bitrate) {
          videoConfig.bitrate = probedSourceInfo.bitrate;
        }
      }

      const outputPath = await window.electronAPI.saveFileDialog({
        title: 'Save exported video',
        defaultPath: 'video.mp4',
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      });

      if (!outputPath) {
        exportStarting = false;
        return;
      }

      const hasBgVideo = matchSource && that.logParameters.flightVideoPath;
      const logPath = that.logParameters.logPath;

      // 提取当前图表配置，保留完整 graph 结构（label + fields）
      const graphConfig = that.logParameters.graphConfig;
      const graphs = [];
      if (graphConfig && graphConfig.getGraphs) {
        const srcGraphs = graphConfig.getGraphs();
        for (const g of (srcGraphs || [])) {
          const fields = [];
          for (const f of (g.fields || [])) {
            fields.push({
              fieldName: f.name,
              color: f.color || `hsl(${fields.length * 60 % 360}, 70%, 60%)`,
              width: (f.curve && f.curve.width) || 1.5,
            });
          }
          graphs.push({ label: g.label || '', height: g.height || 100, fields: fields });
        }
      }
      console.log('[ExportDialog] graphs:', graphs.length);

      // **先注册监听，再调用 exportVideoStartB（避免竞态）**
      window.electronAPI.onExportCmdLine((cmd) => {
        console.log('[ExportDialog] ffmpeg cmd:', cmd);
      });
      window.electronAPI.onExportProgress((data) => {
        if (data.frameIndex !== undefined) {
          progressBar.prop("max", data.totalFrames - 1);
          progressBar.prop("value", data.frameIndex);
          progressRenderedFrames.text(
            `${data.frameIndex + 1} / ${data.totalFrames} (${(
              ((data.frameIndex + 1) / data.totalFrames) * 100
            ).toFixed(1)}%)`
          );
          if (data.frameIndex > 0) {
            const elapsed = Date.now() - renderStartTime;
            const estimated = (elapsed * data.totalFrames) / data.frameIndex;
            const remaining = Math.max(Math.round((estimated - elapsed) / 1000), 0);
            progressRemaining.text(formatTime(remaining));
          }
        }
      });
      window.electronAPI.onExportComplete((data) => {
        exportStarting = false;
        if (data.success) {
          $(".video-export-result", $dlg).text('Export completed');
          setDialogMode(DIALOG_MODE_COMPLETE);
        } else {
          console.error('[ExportDialog] export failed:', data.error);
          dialog.modal("hide");
        }
      });

      // 方案 B：主进程读日志 + node-canvas 渲染
      window.electronAPI.exportVideoStartB({
        width: videoConfig.width,
        height: videoConfig.height,
        frameRate: videoConfig.frameRate,
        encoder: encoderInfo.encoder,
        bitrate: videoConfig.bitrate,
        gop: videoConfig.gop,
        outputPath: outputPath,
        videoSourcePath: hasBgVideo ? that.logParameters.flightVideoPath : null,
        logPath: logPath,
        inTime: that.logParameters.inTime,
        outTime: that.logParameters.outTime,
        flightVideoOffset: that.logParameters.flightVideoOffset || 0,
        graphs: graphs,
        userSettings: globalThis.userSettings || {},
      });

      if (hasBgVideo) delete that.logParameters.flightVideo;

      renderStartTime = Date.now();
      lastEstimatedTimeMsec = false;
      setDialogMode(DIALOG_MODE_IN_PROGRESS);
      progressBar.prop("value", 0);
      progressRenderedFrames.text("");
      progressRemaining.text("");
      progressSize.parent().parent().hide();
      fileSizeWarning.hide();

      return;
    }

    videoRenderer = new FlightLogVideoRenderer(
      that.flightLog,
      that.logParameters,
      videoConfig,
      {
        onProgress: function (frameIndex, frameCount) {
          progressBar.prop("max", frameCount - 1);
          progressBar.prop("value", frameIndex);

          progressRenderedFrames.text(
            `${frameIndex + 1} / ${frameCount} (${(
              ((frameIndex + 1) / frameCount) *
              100
            ).toFixed(1)}%)`
          );

          if (frameIndex > 0) {
            let elapsedTimeMsec = Date.now() - renderStartTime,
              estimatedTimeMsec = (elapsedTimeMsec * frameCount) / frameIndex;

            if (lastEstimatedTimeMsec === false) {
              lastEstimatedTimeMsec = estimatedTimeMsec;
            } else {
              lastEstimatedTimeMsec =
                lastEstimatedTimeMsec * 0.0 + estimatedTimeMsec * 1.0;
            }

            let estimatedRemaining = Math.max(
              Math.round((lastEstimatedTimeMsec - elapsedTimeMsec) / 1000),
              0
            );
            progressRemaining.text(formatTime(estimatedRemaining));
          }
        },
        onComplete: function (success, frameCount) {
          exportStarting = false;
          if (success) {
            $(".video-export-result", $dlg).text(
              `Rendered ${frameCount} frames in ${formatTime(
                Math.round((Date.now() - renderStartTime) / 1000)
              )}`
            );
            setDialogMode(DIALOG_MODE_COMPLETE);
          } else {
            dialog.modal("hide");
          }
          if (videoRenderer) {
            videoRenderer = false;
          }
        },
      }
    );

    progressBar.prop("value", 0);
    progressRenderedFrames.text("");
    progressRemaining.text("");
    progressSize.parent().parent().hide();
    fileSizeWarning.hide();

    setDialogMode(DIALOG_MODE_IN_PROGRESS);

    renderStartTime = Date.now();
    lastEstimatedTimeMsec = false;
    videoRenderer.start();

    e.preventDefault();
  });

  $(".video-export-dialog-cancel", $dlg).off("click").click(function (e) {
    if (videoRenderer) {
      videoRenderer.cancel();
    } else if (window.electronAPI) {
      window.electronAPI.exportVideoCancel();
    }
  });

  dialog.modal({
    show: false,
    backdrop: "static",
  });
}
