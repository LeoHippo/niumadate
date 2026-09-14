import { buildServer } from './server';
import { loadConfig, usesDevSecrets } from './config';
import { setLogger } from './log';
import { initSettings } from './settings';
import { initSubmissions } from './submissions';

try {
  process.loadEnvFile();
} catch {
  // 没有 .env 文件是正常情况，继续用默认值和真实环境变量。
}

const config = loadConfig();

// 先建 app（logger 在这里面创建），再把 store 层也接到同一个 logger 上，
// 这样业务日志和请求日志格式一致、时间线能对上。
const app = await buildServer(config);
setLogger(app.log);

initSettings(config.dataDir);
initSubmissions(config.dataDir);

// 生产环境却没开 trustProxy —— 多半是前面挂了反代忘了配，
// 症状是限流把所有人当成同一个人，很难查，所以这里主动喊一声。
if (config.isProduction && !config.trustProxy) {
  app.log.warn(
    '生产环境没开 TRUST_PROXY。如果前面挂了 Caddy / Nginx，限流会把所有好友当成同一个 IP，日志里的来源也全是 127.0.0.1。',
  );
}

if (usesDevSecrets(config)) {
  app.log.warn(
    '正在使用开发默认口令（ADMIN_PASSWORD=niuma-dev）。部署到公网前务必用环境变量覆盖 ADMIN_PASSWORD 与 SESSION_SECRET。',
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`收到 ${signal}，正在关闭`);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });

  // 启动横幅：出问题时第一件要看的就是这几行
  app.log.info(
    {
      url: `http://${config.host}:${config.port}`,
      dataDir: config.dataDir,
      webDist: config.webDist,
      logLevel: config.logLevel,
      logFile: config.logFile,
      isProduction: config.isProduction,
      trustProxy: config.trustProxy,
      usingDevSecrets: usesDevSecrets(config),
    },
    '启动完成',
  );
} catch (error) {
  app.log.error({ err: error }, '监听失败，进程退出');
  process.exit(1);
}
