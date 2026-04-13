// node built-in fetch
async function test() {
    console.log("Testing POST /api/config/nx...");
    
    try {
        const res = await fetch("http://localhost:3001/api/config/nx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                NEXT_PUBLIC_NX_SERVER_HOST: "192.168.1.100",
                NEXT_PUBLIC_NX_SERVER_PORT: "7001"
            })
        });
        
        console.log("Response status:", res.status);
        const data = await res.json();
        console.log("Response data:", data);
        
        // Read file to verify
        const fs = await import('fs');
        const path = await import('path');
        const home = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
        const configPath = path.join(home, 'hotware-dashboard', '.env.local');
        
        console.log("Config Path:", configPath);
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            console.log("File content after update:");
            console.log(content);
        } else {
            console.log("File NOT found!");
        }
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
