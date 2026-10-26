const fs = require('fs');
const path = require('path');

async function login() {
  const username = process.argv[2] || process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME || 'support15@hotware.id';
  const password = process.argv[3] || process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD || 'vivo1234';

  console.log(`Logging in to Nx Cloud for ${username}...`);

  try {
    const res = await fetch('https://nxvms.com/cdb/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        response_type: 'token',
        username,
        password,
        client_id: 'api-tool'
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Login failed: ${res.status} - ${err}`);
      process.exit(1);
    }

    const data = await res.json();
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      email: username,
      updatedAt: Date.now()
    };

    const targetDirs = [
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), '.next', 'standalone', 'data'),
      path.join(process.cwd(), '..', 'data'),
      '/www/wwwroot/108.136.246.113/dashboard-hotware/data',
      '/www/wwwroot/108.136.246.113/dashboard-hotware/.next/standalone/data',
    ];

    for (const d of targetDirs) {
      try {
        const parent = path.dirname(d);
        if (fs.existsSync(parent)) {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          const file = path.join(d, 'nx_cloud_session.json');
          fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf-8');
          console.log(`✅ Saved session to: ${file}`);
        }
      } catch (_) {}
    }

    console.log(`The 24/7 background watchdog can now monitor cameras headlessly.`);
  } catch (err) {
    console.error('Error during login:', err);
    process.exit(1);
  }
}

login();
