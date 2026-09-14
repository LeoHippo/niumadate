# ---------------------------------------------------------------------------
# 牛马出栏审批单 —— 容器镜像
#
# 两段式：builder 里装依赖 + 构建，runtime 只留跑得起来的东西。
#
# 为什么 runtime 是把整个 /app 拷过去、而不是重装一遍生产依赖：
# pnpm 的 node_modules 是一堆指向根目录 .pnpm 仓库的符号链接，
# 只挑 apps/server/node_modules 拷过去链接就全断了。
# 整份拷虽然大一些（约 800MB），但**一定是对的** —— 教人的东西不该在细节上翻车。
# 想瘦身就自己改成只装生产依赖，注意别踩上面那个坑。
# ---------------------------------------------------------------------------

FROM node:24-slim AS builder
WORKDIR /app

# 版本跟 package.json 里的 packageManager 对齐
RUN npm install -g pnpm@12.4.1

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r run build

# ---------------------------------------------------------------------------

FROM node:24-slim
WORKDIR /app

ENV NODE_ENV=production
# 容器里必须监听 0.0.0.0，否则端口映射进不来
ENV HOST=0.0.0.0
ENV PORT=8787
# 数据库、配置、自动生成的后台口令都放这儿
ENV DATA_DIR=/data

COPY --from=builder /app /app

# 挂一个卷出来：容器删了数据还在；不想要了把卷一起删掉即可
VOLUME ["/data"]

EXPOSE 8787

CMD ["node", "apps/server/dist/index.js"]
