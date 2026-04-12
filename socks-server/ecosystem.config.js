module.exports = {
  apps: [{
    name: 'socks-server',
    script: './bin/socks-server',
    env: {
      SOCKS_LISTEN: process.env.SOCKS_LISTEN || '0.0.0.0:1080',
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
  }]
}
