module.exports = {
  apps: [
    {
      name: "hotai-web",
      cwd: "./apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "hotai-fetcher",
      cwd: "./apps/fetcher",
      script: "./node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "256M",
      out_file: "./logs/fetcher-out.log",
      error_file: "./logs/fetcher-err.log",
      merge_logs: true,
      time: true,
      restart_delay: 5000,
    },
  ],
};
