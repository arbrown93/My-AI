#!/bin/bash

# Lambda Labs A6000 Setup Script for Llama 3.1 70B
# Run this on your Lambda Labs instance

# Exit on error, but we'll handle errors more gracefully
set -e

# Ensure output is not buffered
export PYTHONUNBUFFERED=1
stty -echo 2>/dev/null || true

echo "🚀 Starting Lambda Labs Setup for Llama 3.1 70B..."
echo "📋 Progress will be logged to ~/lambda-setup.log"
exec > >(tee -a ~/lambda-setup.log) 2>&1

# Update systemd
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Ollama
echo "🦙 Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
echo "🔧 Starting Ollama service..."
sudo systemctl start ollama
sudo systemctl enable ollama

# Wait for Ollama to be ready
sleep 5

# Pull Llama 3.1 70B model
echo "📥 Pulling Llama 3.1 70B model (this will take a while - ~40GB download)..."
ollama pull llama3.1:70b

# Install nginx for reverse proxy with API key auth
echo "🔒 Setting up nginx reverse proxy..."
sudo apt-get install -y nginx

# Generate a random API key
API_KEY=$(openssl rand -hex 32)

# Create nginx config with API key authentication
sudo tee /etc/nginx/sites-available/ollama > /dev/null <<EOF
map \$http_x_api_key \$api_key_valid {
    default 0;
    "$API_KEY" 1;
}

server {
    listen 8080;
    server_name _;

    # Increase timeouts for long responses
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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

        # Enable chunked transfer encoding for streaming
        chunked_transfer_encoding on;
        proxy_buffering off;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
echo "🧪 Testing nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration valid"
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
else
    echo "❌ Nginx configuration test failed!"
    exit 1
fi

# Open firewall port
echo "🔥 Configuring firewall..."
if sudo ufw status | grep -q "Status: active"; then
    sudo ufw allow 8080/tcp
    echo "✅ Firewall rule added"
else
    echo "ℹ️  UFW is not active, skipping firewall configuration"
fi

# Save API key to file
echo "💾 Saving API key..."
echo "$API_KEY" > ~/ollama_api_key.txt
chmod 600 ~/ollama_api_key.txt
echo "✅ API key saved to ~/ollama_api_key.txt"

# Get public IP (try multiple methods)
echo "🌐 Detecting public IP address..."
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || curl -s --max-time 5 icanhazip.com || curl -s --max-time 5 api.ipify.org || echo "UNABLE_TO_DETECT")

# Force output flush
exec 1>&2

echo ""
echo "✅ Setup Complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 IMPORTANT - SAVE THESE DETAILS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔑 API Key: $API_KEY"
echo ""
if [ "$PUBLIC_IP" = "UNABLE_TO_DETECT" ]; then
    echo "⚠️  Could not auto-detect public IP"
    echo "🌐 Endpoint: http://YOUR_LAMBDA_IP:8080"
    echo ""
    echo "Run this command to get your IP: curl ifconfig.me"
else
    echo "🌐 Endpoint: http://$PUBLIC_IP:8080"
fi
echo ""
echo "Your API key is also saved to: ~/ollama_api_key.txt"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🧪 Test the endpoint with:"
echo ""
if [ "$PUBLIC_IP" = "UNABLE_TO_DETECT" ]; then
    echo 'curl -X POST http://YOUR_LAMBDA_IP:8080/api/generate \'
else
    echo 'curl -X POST http://'"$PUBLIC_IP"':8080/api/generate \'
fi
echo '  -H "Content-Type: application/json" \'
echo '  -H "X-API-Key: '"$API_KEY"'" \'
echo '  -d '"'"'{"model": "llama3.1:70b", "prompt": "Why is the sky blue?", "stream": false}'"'"
echo ""
echo "For Vercel deployment, add these environment variables:"
if [ "$PUBLIC_IP" = "UNABLE_TO_DETECT" ]; then
    echo "  OLLAMA_BASE_URL=http://YOUR_LAMBDA_IP:8080"
else
    echo "  OLLAMA_BASE_URL=http://$PUBLIC_IP:8080"
fi
echo "  OLLAMA_API_KEY=$API_KEY"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
