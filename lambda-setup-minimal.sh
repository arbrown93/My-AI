#!/bin/bash

# Minimal Lambda Setup - Just API key and nginx
# Run this if the full setup is failing

set -e

echo "🚀 Minimal Lambda Setup (API key + nginx proxy)"

# Check if Ollama is already installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama not found. Please install it first:"
    echo "   curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

echo "✅ Ollama found"

# Generate API key
echo "🔑 Generating API key..."
API_KEY=$(openssl rand -hex 32)

# Install nginx if needed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
fi

# Create nginx config
echo "⚙️  Configuring nginx..."
sudo tee /etc/nginx/sites-available/ollama > /dev/null <<EOF
map \$http_x_api_key \$api_key_valid {
    default 0;
    "$API_KEY" 1;
}

server {
    listen 8080;
    server_name _;

    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        if (\$api_key_valid = 0) {
            return 401 '{"error": "Invalid or missing API key"}';
        }

        proxy_pass http://localhost:11434;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;

        chunked_transfer_encoding on;
        proxy_buffering off;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
echo "🧪 Testing nginx..."
sudo nginx -t
sudo systemctl reload nginx
echo "✅ Nginx configured and running"

# Save API key
echo "$API_KEY" > ~/ollama_api_key.txt
chmod 600 ~/ollama_api_key.txt

# Get IP
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || echo "UNKNOWN")

# Display results
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SETUP COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔑 API Key:"
echo "$API_KEY"
echo ""
echo "🌐 Endpoint:"
if [ "$PUBLIC_IP" != "UNKNOWN" ]; then
    echo "http://$PUBLIC_IP:8080"
else
    echo "http://YOUR_LAMBDA_IP:8080"
    echo "(Run 'curl ifconfig.me' to get your IP)"
fi
echo ""
echo "📁 API key saved to: ~/ollama_api_key.txt"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🧪 Test command:"
echo ""
if [ "$PUBLIC_IP" != "UNKNOWN" ]; then
    echo "curl -X POST http://$PUBLIC_IP:8080/api/generate \\"
else
    echo "curl -X POST http://YOUR_IP:8080/api/generate \\"
fi
echo '  -H "Content-Type: application/json" \'
echo "  -H \"X-API-Key: $API_KEY\" \\"
echo '  -d '"'"'{"model": "llama3.1:70b", "prompt": "Hello!", "stream": false}'"'"
echo ""
