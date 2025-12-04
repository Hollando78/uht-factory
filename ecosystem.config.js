module.exports = {
  apps: [
    {
      name: 'uht-factory-api',
      cwd: '/root/project/uht-factory',
      script: '/root/project/uht-factory/venv/bin/uvicorn',
      args: 'api.main:app --host 127.0.0.1 --port 8100',
      interpreter: 'none',
      env: {
        PATH: '/root/project/uht-factory/venv/bin:' + process.env.PATH
      },
      max_restarts: 10,
      restart_delay: 1000,
      autorestart: true,
      watch: false,
      log_file: '/root/project/uht-factory/logs/pm2-combined.log',
      out_file: '/root/project/uht-factory/logs/pm2-out.log',
      error_file: '/root/project/uht-factory/logs/pm2-error.log',
      time: true
    }
  ]
};
