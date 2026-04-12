module.exports = {
  apps: [{
    name: 'pimpam-server',
    script: './bin/pimpam-server',
    env: {
      PIMPAM_LISTEN: process.env.PIMPAM_LISTEN || '0.0.0.0:8444',
      PIMPAM_PRIV: process.env.PIMPAM_PRIV || '',
      TLS_CERT: process.env.TLS_CERT || '',
      TLS_KEY: process.env.TLS_KEY || '',
      MASQ_DOMAIN: process.env.MASQ_DOMAIN || 'www.cloudflare.com',
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
