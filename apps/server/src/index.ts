import { buildServer } from './server';
import { join } from 'node:path';
import { loadConfig } from './config';
import { setLogger } from './log';
import { initSettings } from './settings';
import { initSubmissions } from './submissions';
import { initInvites } from './invites';

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
initInvites(config.dataDir);

// 生产环境却没开 trustProxy —— 多半是前面挂了反代忘了配，
// 症状是限流把所有人当成同一个人，很难查，所以这里主动喊一声。
if (config.isProduction && !config.trustProxy) {
  app.log.warn(
    '生产环境没开 TRUST_PROXY。如果前面挂了 Caddy / Nginx，限流会把所有好友当成同一个 IP，日志里的来源也全是 127.0.0.1。',
  );
}

// 现场生成了口令 / 密钥，说明之前没配过。**必须让主人看见**，
// 否则他既进不去后台，也不知道该去哪里找。
if (config.generatedAdminPassword || config.generatedSessionSecret) {
  const lines = [
    '',
    '════════════════════════════════════════════════════',
    '  已为你生成新的密钥（只显示这一次，请立刻记下来）',
    '════════════════════════════════════════════════════',
  ];
  if (config.generatedAdminPassword) {
    lines.push(`  后台口令：${config.adminPassword}`);
  }
  if (config.generatedSessionSecret) {
    lines.push(`  会话密钥：${config.sessionSecret}`);
  }
  lines.push(
    // 用 join 而不是手写分隔符：Linux 上是 /，Windows 上是 ，
    // 写死反斜杠的话在容器里就会打出 /data\admin-password 这种怪东西。
    `  存放位置：${join(config.dataDir, 'admin-password')}、session-secret`,
    '',
    '  想换成自己的口令：设环境变量 ADMIN_PASSWORD，或者',
    '  直接改上面那个文件，然后重启。',
    '════════════════════════════════════════════════════',
    '',
  );
  app.log.warn(lines.join('\n'));
}

// 口令太短，登录限流也挡不住慢慢猜。
if (config.adminPasswordSource === 'env' && config.adminPassword.length < 12) {
  app.log.warn(
    `ADMIN_PASSWORD 只有 ${config.adminPassword.length} 位，偏短。建议 12 位以上，或者干脆不设、让程序随机生成。`,
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
      adminPasswordSource: config.adminPasswordSource,
    },
    '启动完成',
  );
} catch (error) {
  app.log.error({ err: error }, '监听失败，进程退出');
  process.exit(1);
}
