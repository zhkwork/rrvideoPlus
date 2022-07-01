import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import puppeteer from "puppeteer";
import type { eventWithTime } from "rrweb/typings/types";
import type { RRwebPlayerOptions } from "rrweb-player";

const rrwebScriptPath = path.resolve(
  require.resolve("rrweb-player"),
  "../../dist/index.js"
);
const rrwebStylePath = path.resolve(rrwebScriptPath, "../style.css");
const rrwebRaw = fs.readFileSync(rrwebScriptPath, "utf-8");
const rrwebStyle = fs.readFileSync(rrwebStylePath, "utf-8");

function getHtml(
  events: Array<eventWithTime>,
  config?: Omit<RRwebPlayerOptions["props"], "events">
): string {
  return `
<html>
  <head>
  <style>${rrwebStyle}</style>
  </head>
  <body>
    <script>
      ${rrwebRaw};
      /*<!--*/
      const events = ${JSON.stringify(events).replace(
      /<\/script>/g,
      "<\\/script>"
  )};
      /*-->*/
      function start() {
          window.snap();
      }
      function playAnyTimeAndSnap (fps) {
          window.replayer.play();
          setTimeout(function() {
            window.replayer.pause();
            window.snap();
          }, 1000 / fps);
      }
      const userConfig = ${config ? JSON.stringify(config) : {}};
      
      window.replayer = new rrwebPlayer({
        target: document.body,
        props: {
          events,
          autoPlay: false,
          showController: false,
          ...userConfig
        },
      });
      window.start();
      window.replayer.addEventListener('finish', () => window.onReplayFinish());
    </script>
  </body>
</html>
`;
}

type RRvideoConfig = {
  fps: number;
  headless: boolean;
  input: string;
  cb: (file: string, error: null | Error) => void;
  output: string;
  rrwebPlayer: Omit<RRwebPlayerOptions["props"], "events">;
};

const defaultConfig: RRvideoConfig = {
  fps: 15,
  headless: true,
  input: "",
  cb: () => {},
  output: "rrvideo-output.mp4",
  rrwebPlayer: {
    "width": 1200,
    "height": 700,
    "speed": 1,
    "skipInactive": false,
    "mouseTail": {
      "strokeStyle": "green",
      "lineWidth": 2
    }
  },
};

class RRvideo {
  private browser!: puppeteer.Browser;
  private page!: puppeteer.Page;
  private state: "idle" | "recording" | "closed" = "idle";
  private config: RRvideoConfig;
  private ffmpegProcess;

  constructor(config?: Partial<RRvideoConfig> & { input: string }) {
    this.config = {
      fps: config?.fps || defaultConfig.fps,
      headless: config?.headless || defaultConfig.headless,
      input: config?.input || defaultConfig.input,
      cb: config?.cb || defaultConfig.cb,
      output: config?.output || defaultConfig.output,
      rrwebPlayer: config?.rrwebPlayer || defaultConfig.rrwebPlayer,
    };
    // start ffmpeg
    const args = [
      // fps
      "-framerate",
      this.config.fps.toString(),
      // input
      "-f",
      "image2pipe",
      "-i",
      "-",
      "-qscale",
      "1",
      // output
      "-y",
      this.config.output,
    ];
    this.ffmpegProcess = spawn("ffmpeg", args);
    this.ffmpegProcess.stderr.setEncoding("utf-8");
    this.ffmpegProcess.stderr.on("data", console.log);
  }

  public async init() {
    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: ['--unlimited-storage','--full-memory-crash-report', '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      await this.page.setDefaultNavigationTimeout(0)
      await this.page.goto("about:blank");

      await this.page.exposeFunction("snap", () => {
        this.snap();
      });

      await this.page.exposeFunction("onReplayFinish", () => {
        this.finishRecording();
      });

      const eventsPath = path.isAbsolute(this.config.input)
        ? this.config.input
        : path.resolve(process.cwd(), this.config.input);
      const events = JSON.parse(fs.readFileSync(eventsPath, "utf-8"));
      if (events.length > 2) {
        const timeLength = events[events.length - 1].timestamp - events[0].timestamp
        console.log(`Recording duration: ${timeLength / 1000} seconds`)
      }
      console.log(`Fps: ${this.config.fps}`)
      await this.page.setContent(getHtml(events, this.config.rrwebPlayer));
    } catch (error) {
      this.config.cb("", error);
    }
  }

  private async snap() {
    if (this.state === "closed") {
      this.ffmpegProcess.stdin.end();
      const outputPath = path.isAbsolute(this.config.output)
          ? this.config.output
          : path.resolve(process.cwd(), this.config.output);
      this.ffmpegProcess.on("close", () => {
        this.config.cb(outputPath, null);
      });
      return;
    }
    this.state = "recording";
    let wrapperSelector = ".replayer-wrapper";
    if (this.config.rrwebPlayer.width && this.config.rrwebPlayer.height) {
      wrapperSelector = ".rr-player";
    }
    const wrapperEl = await this.page.$(wrapperSelector);
    if (!wrapperEl) {
      throw new Error("failed to get replayer element");
    }
    await wrapperEl.screenshot({
      encoding: "binary",
    }).then(buffer => {
      this.ffmpegProcess.stdin.write(buffer);
      this.page.evaluate((fps) => {
          (window as any).playAnyTimeAndSnap(fps);
      }, this.config.fps)
    })
  }

  private async finishRecording() {
    this.state = "closed";
    var _this = this;
    setTimeout(function () {
      _this.browser.close();
    }, 1000)
  }
}

export function transformToVideo(
  config: Partial<RRvideoConfig> & { input: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const rrvideo = new RRvideo({
      ...config,
      cb(file, error) {
        if (error) {
          return reject(error);
        }
        resolve(file);
      },
    });
    rrvideo.init();
  });
}
