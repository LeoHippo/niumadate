import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@niumadate/shared';

const startedAt = Date.now();

/**
 * 存活探针。
 *
 * 刻意**不报提交条数**：这是公开接口，没必要把「收了多少单」告诉所有路过的人。
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      service: 'niumadate-server',
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  });
}
