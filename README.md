# Llama 3.1 70B Chat - Lambda Labs + Vercel

A production-ready chat interface for Llama 3.1 70B running on your Lambda Labs A6000 GPU instance, with a sleek Next.js frontend deployed on Vercel.

## 🏗️ Architecture

```
User → Vercel (Next.js Frontend) → Lambda Labs (Ollama + Llama 3.1 70B)
                                    ↳ nginx (reverse proxy + API auth)
```

## 📋 Prerequisites

- Lambda Labs GPU instance (A6000 recommended for 70B model)
- Vercel account (free tier works)
- GitHub account (for deploying to Vercel)
- SSH access to Lambda Labs instance

---

## 🚀 Part 1: Lambda Labs Setup

### Step 1: SSH into Lambda Labs

```bash
ssh ubuntu@YOUR_LAMBDA_IP
```

### Step 2: Download and Run Setup Script

```bash
# Download the setup script
wget https://your-setup-script-url/lambda-setup.sh

# Or copy the lambda-setup.sh file provided to your instance
scp lambda-setup.sh ubuntu@YOUR_LAMBDA_IP:~/

# Make it executable
chmod +x lambda-setup.sh

# Run the setup (this will take 15-30 minutes)
./lambda-setup.sh
```

**What this script does:**
- Installs Ollama
- Downloads Llama 3.1 70B (~40GB model)
- Sets up nginx as a reverse proxy with API key authentication
- Configures firewall rules
- Generates a secure API key

### Step 3: Save Your Credentials

After the script completes, you'll see output like this:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 IMPORTANT - SAVE THESE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 API Key: abc123def456...
🌐 Endpoint: http://123.45.67.89:8080
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**SAVE THESE IMMEDIATELY** - you'll need them for Vercel deployment.

### Step 4: Test Your Lambda Instance

```bash
# Test that Ollama is responding
curl -X POST http://localhost:8080/api/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"model": "llama3.1:70b", "prompt": "Hello! Respond in one sentence.", "stream": false}'
```

You should get a JSON response with the model's output.

### Step 5: Keep Lambda Labs Instance Running

**Important**: Your Lambda Labs instance needs to stay running for the chat to work. 

To prevent accidental shutdown:
```bash
# Optional: Set up a systemd service to auto-restart Ollama
sudo systemctl enable ollama
```

---

## 🌐 Part 2: Vercel Deployment

### Step 1: Push Code to GitHub

```bash
# Initialize git in the vercel-app directory
cd vercel-app
git init

# Create a new GitHub repository (via GitHub web interface)
# Then add it as remote
git remote add origin https://github.com/YOUR_USERNAME/llama-chat.git

# Commit and push
git add .
git commit -m "Initial commit: Llama 3.1 70B chat interface"
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project"
3. Import your `llama-chat` repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (or `vercel-app` if you kept the folder structure)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### Step 3: Add Environment Variables

In Vercel project settings → Environment Variables, add:

```
OLLAMA_BASE_URL=http://YOUR_LAMBDA_IP:8080
OLLAMA_API_KEY=your_generated_api_key_from_lambda
```

**Important**: Use the exact values from your Lambda setup script output.

### Step 4: Deploy

Click "Deploy" and wait for the build to complete (~2-3 minutes).

---

## ✅ Testing Your Deployment

Once deployed, Vercel will give you a URL like `https://llama-chat-xyz.vercel.app`

1. Visit your URL
2. Try one of the example prompts or type your own
3. You should see streaming responses from your Lambda Labs Llama 3.1 70B model!

### Troubleshooting

**If chat doesn't work:**

1. **Check Lambda Labs instance is running**
   ```bash
   ssh ubuntu@YOUR_LAMBDA_IP
   sudo systemctl status ollama
   sudo systemctl status nginx
   ```

2. **Verify API key is correct**
   ```bash
   cat ~/ollama_api_key.txt
   ```
   Compare with your Vercel environment variable.

3. **Test Lambda endpoint directly**
   ```bash
   curl -X POST http://YOUR_LAMBDA_IP:8080/api/generate \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_API_KEY" \
     -d '{"model": "llama3.1:70b", "prompt": "Test", "stream": false}'
   ```

4. **Check Vercel logs**
   - Go to your Vercel dashboard
   - Click on your deployment
   - View "Functions" tab for error logs

---

## 🔒 Security Notes

### API Key Protection
- Your API key is required for all requests to Lambda Labs
- The key is stored securely in Vercel environment variables
- Never commit `.env.local` or expose your API key

### Firewall Configuration
- Lambda instance only allows connections on port 8080
- nginx validates API key on every request
- Consider adding IP whitelisting for production use

### Recommended: Use Cloudflare Tunnel (Advanced)

For better security without exposing your Lambda IP:

```bash
# On Lambda Labs instance
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:8080
```

Then use the Cloudflare URL in your Vercel `OLLAMA_BASE_URL` environment variable.

---

## 💰 Cost Estimates

**Lambda Labs A6000:**
- On-demand: ~$1.10/hour
- Monthly (if kept running): ~$792/month

**Vercel:**
- Free tier: Unlimited deploys, 100GB bandwidth
- Pro: $20/month (if you need more)

**Tips to save money:**
- Stop Lambda instance when not in use
- Use Lambda's cheaper GPU options for testing (RTX 6000 Ada)
- Set up auto-shutdown scripts

---

## 🎯 Performance

**Llama 3.1 70B on A6000:**
- First token: ~2-3 seconds
- Streaming speed: ~15-25 tokens/second
- Context window: 128k tokens
- VRAM usage: ~45GB

---

## 🔧 Customization

### Change the Model

Edit `/app/api/chat/route.ts`:

```typescript
model: 'llama3.1:70b',  // Change to 'llama3.1:8b' or other models
```

Then pull the new model on Lambda:
```bash
ollama pull llama3.1:8b
```

### Adjust Temperature/Sampling

In `/app/api/chat/route.ts`:

```typescript
options: {
  temperature: 0.7,  // 0.0 = deterministic, 1.0 = creative
  top_p: 0.9,
  top_k: 40,
}
```

### Style the Interface

Edit `/app/page.tsx` to customize the UI colors, layout, or add features.

---

## 🐛 Common Issues

### "Failed to connect to Lambda Labs"
- Verify instance is running: `ssh ubuntu@YOUR_LAMBDA_IP`
- Check firewall: `sudo ufw status`
- Test endpoint locally from Lambda instance first

### "API Key Invalid"
- Regenerate key: `openssl rand -hex 32`
- Update both nginx config and Vercel env vars
- Restart nginx: `sudo systemctl restart nginx`

### "Model not found"
- List available models: `ollama list`
- Pull model if missing: `ollama pull llama3.1:70b`

### Slow responses
- Check GPU utilization: `nvidia-smi`
- Consider using smaller model (8B instead of 70B)
- Reduce batch size or context length

---

## 📚 Resources

- [Ollama Documentation](https://github.com/ollama/ollama)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Deployment Docs](https://vercel.com/docs)
- [Lambda Labs GPU Cloud](https://lambdalabs.com/service/gpu-cloud)

---

## 🙋 Need Help?

1. Check the troubleshooting section above
2. Review Vercel deployment logs
3. SSH into Lambda Labs and check service status
4. Test the endpoint with curl first

---

## 📝 License

MIT - Do whatever you want with this code!

---

Built with ❤️ for running massive LLMs on your own hardware.
