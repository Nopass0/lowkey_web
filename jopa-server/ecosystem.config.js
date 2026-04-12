module.exports = {
  apps: [{
    name: 'jopa-server',
    script: './bin/jopad',
    env: {
      JOPA_PSK: process.env.JOPA_PSK || '',
      JOPA_PRIV: process.env.JOPA_PRIV || '',
      JOPA_PORT: process.env.JOPA_PORT || '9050',
      VOIDDB_URL: process.env.VOIDDB_URL || 'https://db.lowkey.su',
      VOIDDB_TOKEN: process.env.VOIDDB_TOKEN || '',
      BACKEND_URL: process.env.BACKEND_URL || 'https://lowkey.su/api',
      BACKEND_SECRET: process.env.BACKEND_SECRET || '',
      SERVER_IP: process.env.SERVER_IP || '',
      SERVER_ID: process.env.SERVER_ID || '',
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    log_file: '/var/log/pm2/jopa-server.log',
    error_file: '/var/log/pm2/jopa-server-err.log',
    out_file: '/var/log/pm2/jopa-server-out.log',
  }]
}
