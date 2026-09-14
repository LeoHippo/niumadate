import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { API_PREFIX } from '@niumadate/shared';
import type { AppConfig } from './config';
import { createLogStream } from './log';
import { registerAdminRoutes } from './routes/admin';
import { registerHealthRoutes } from './routes/health';
import { registerPublicRoutes } from './routes/public';
import { registerStatic } from './static';

/**
 * 组装 Fastify 实例，但不负责 listen —— 测试可以直接用 `app.inject()`
 * 打请求，不需要真的占用端口。
 */
export async function buildServer(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    // 代理后面必须开，否则 request.ip 全是 127.0.0.1（见 config.ts 的注释）
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel,
      stream: createLogStream(config.logFile),
    },
  });

  await app.register(cors, { origin: config.webOrigin });

  await app.register(
    async (api) => {
      registerHealthRoutes(api);
      registerPublicRoutes(api);
      registerAdminRoutes(api, config);
    },
    { prefix: API_PREFIX },
  );

  // 路径对不对是部署时最容易踩的坑，所以这里明确记一条
  const staticReady = await registerStatic(app, config.webDist);
  if (staticReady) {
    app.log.info({ webDist: config.webDist }, '已托管前端构建产物，SPA 回退已开启');
  } else {
    app.log.warn(
      { webDist: config.webDist },
      '没找到前端构建产物，本次只提供 API。生产环境请先执行 pnpm build',
    );
  }

  return app;
}
