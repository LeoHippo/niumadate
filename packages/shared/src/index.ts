/**
 * 前后端共享的 API 契约。
 *
 * 这里只放类型、常量、配置默认值和纯函数：浏览器和 Node 都会加载它，
 * 因此不能出现任何 `node:` 前缀的运行时依赖。
 */

export * from './types';
export * from './config';
export * from './schedule';
export * from './voices';
