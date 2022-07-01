# 项目原因

项目需要把rrweb录制的dom数据转换为视频文件，官方rrvideo项目可以做到但还有缺陷。

1. rrvideo 源码中有些需要改动的地方

   - [puppeteer启动参数](https://github.com/rrweb-io/rrvideo/blob/24751628ecead6b236bdd5d57c0264a6207773e5/src/index.ts#L90)，会导致部署在centos系统执行时会报错

     ```
       this.browser = await puppeteer.launch({
         headless: this.config.headless,
       });
     ```

     增加配置

     ```
     args: ['--unlimited-storage','--full-memory-crash-report', '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
     ```

     当然这只是修改puppeteer参数，正式部署后还有很多依赖需要有，可以看后面关于部署的说明

   

   - [ffmpeg参数](https://github.com/rrweb-io/rrvideo/blob/24751628ecead6b236bdd5d57c0264a6207773e5/src/index.ts#L127)

      rrweb默认的ffmpeg参数录制出来的视频清晰度很低，测试出来的结果是糊成一片

     ```
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
           // output
           "-y",
           this.config.output,
         ];
     ```

     args增加参数，这样截图转出的视频清晰度可以提高

     ```
      "-qscale", "1",
     ```

      参数说明：-qscale <数值> 以<数值>质量为基础的VBR，取值0.01-255，约小质量越好。

      实际试了几个小于1的小数，效果几乎不变，但是比不加的情况好上很多。

      毕竟puppeteer截出的原图清晰度就比不上纯dom展示，最后生成视频能达到看清文字内容的程度即可。

2. puppeteer截图时间问题

使用[rrvideo](https://github.com/rrweb-io/rrvideo) 项目测试发现puppeteer截图操作 page.screenshot() 需要花费一定时间（[详见](https://zhaoqize.github.io/puppeteer-api-zh_CN/#?product=Puppeteer&version=v14.3.0&show=api-pagescreenshotoptions)），在生成截图的时间内rrweb“视频”还在继续播放，而ffmpeg继续按照设置的fps生成视频，最终导致时间不一致。

后看到[rrweb-to-video](https://github.com/gumuqi/rrweb-to-video)项目的思路，dom播放时定位到时间点截图（使用rrpaly.pause(time)方法），能解决上述问题。但结果发现视频中没有了鼠标轨迹，后测试发现是rrpaly.pause(time)方法不会显示轨迹。

最终在[rrvideo](https://github.com/rrweb-io/rrvideo)基础上，借鉴[rrweb-to-video](https://github.com/gumuqi/rrweb-to-video)暂停截图的思路，修改为 截图 -> 播放一段时间 -> 暂停 循环思路，这样既能解决rrvideo少帧的问题，也能解决rrweb-to-video没有鼠标轨迹问题。





# 执行命令
npm i  && npm i -g 

全局安装后，可以直接使用 

rrvideoPlus --input dom.json 执行转视频操作

或者

npm i
node build\cli.js --input dom.json

`--output、--config参数可选`





# 部署到centos

就像官方文档说的，需要ffmpeg、nodejs支持

还需要有puppeteer运行依赖及中文支持

#安装puppeteer运行依赖 及中文支持

```
# yum -y install pango.x86_64 libXcomposite.x86_64 libXcursor.x86_64 libXdamage.x86_64 libXext.x86_64 libXi.x86_64 libXtst.x86_64 cups-libs.x86_64 libXScrnSaver.x86_64 libXrandr.x86_64 GConf2.x86_64 alsa-lib.x86_64 atk.x86_64 gtk3.x86_64 ipa-gothic-fonts xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi xorg-x11-utils xorg-x11-fonts-cyrillic xorg-x11-fonts-Type1 xorg-x11-fonts-misc
# yum -y groupinstall "fonts"
```

当然更简单的方式是使用docker，笔者上传了 基于centos7.7 集成ffmpeg_5.0、nodejs_16、jdk_8、puppeteer依赖及中文环境支持的镜像，可以开箱即用

[centos7-ffmpeg5-puppeteer](https://hub.docker.com/r/zhkwork/ffmpeg5-puppeteer/tags)






以下内容来自rrvideo
------------------------------------------
------------------------------------------
# rrvideo

rrvideo 是用于将 [rrweb](https://github.com/rrweb-io/rrweb) 录制的数据转为视频格式的工具。

## 安装 rrvideo

1. 安装 [ffmpeg](https://ffmpeg.org/download.html)。
2. 安装 [Node.JS](https://nodejs.org/en/download/)。
3. 执行 `npm i -g rrvideo` 以安装 rrvideo CLI。

## 使用 rrvideo

### 将一份 rrweb 录制的数据（JSON 格式）转换为视频。

```shell
rrvideo --input PATH_TO_YOUR_RRWEB_EVENTS_FILE
```

运行以上命令会在执行文件夹中生成一个 `rrvideo-output.mp4` 文件。

### 指定输出路径

```shell
rrvideo --input PATH_TO_YOUR_RRWEB_EVENTS_FILE --output OUTPUT_PATH
```

### 对回放进行配置

通过编写一个 rrvideo 配置文件再传入 rrvideo CLI 的方式可以对回放进行一定的配置。

```shell
rrvideo --input PATH_TO_YOUR_RRWEB_EVENTS_JSON_FILE --config PATH_TO_YOUR_RRVIDEO_CONFIG_FILE
```

rrvideo 配置文件可参考[示例](./rrvideo.config.example.json)。


[在rrvideo]: https://github.com/rrweb-io/rrvideo