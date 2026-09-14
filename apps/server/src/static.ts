import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { apiError } from '@niumadate/shared';

/**
 * 生产环境：后端直接把前端构建产物托管出去，一个端口搞定，也没有跨域问题。
 * 开发环境前端跑在 Vite 上，这里因为找不到 dist 会直接跳过。
 * @returns 是否真的注册了静态托管。
 */
export async function registerStatic(app: FastifyInstance, webDist: string): Promise<boolean> {
  if (!existsSync(join(webDist, 'index.html'))) return false;

  await app.register(fastifyStatic, { root: webDist, prefix: '/' });

  // SPA 回退：非 /api 的未知路径一律交给前端路由
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      void reply.code(404).send(apiError('NOT_FOUND', '接口不存在'));
      return;
    }
    void reply.code(200).sendFile('index.html');
  });

  return true;
}
