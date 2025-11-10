# 🚀 Hotware Dashboard - Git Deployment Guide

A complete guide for deploying the Hotware Camera Surveillance Dashboard to Git repositories and various hosting platforms.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Local Git Setup](#local-git-setup)
- [GitHub Deployment](#github-deployment)
- [GitLab Deployment](#gitlab-deployment)
- [Bitbucket Deployment](#bitbucket-deployment)
- [Hosting Platform Deployment](#hosting-platform-deployment)
- [Environment Configuration](#environment-configuration)
- [CI/CD Pipeline Setup](#cicd-pipeline-setup)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

Before deploying, ensure you have:

- **Git** installed on your system
- **Node.js** 18+ and npm
- **Git account** (GitHub, GitLab, or Bitbucket)
- **Terminal/Command Prompt** access

### Verify Installation
```bash
git --version
node --version
npm --version
```

## 💻 Local Git Setup

### 1. Configure Git (First Time Only)
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2. Initialize Repository (Already Done)
The repository is already initialized with the initial commit.

### 3. Check Repository Status
```bash
git status
git log --oneline
```

## 🐙 GitHub Deployment

### Option 1: Using GitHub CLI (Recommended)
```bash
# Install GitHub CLI if not already installed
# Windows: winget install --id GitHub.cli
# macOS: brew install gh
# Linux: Check GitHub CLI installation docs

# Login to GitHub
gh auth login

# Create repository and push
gh repo create hotware-dashboard --public --description "Professional camera surveillance dashboard by Hotware"
git remote add origin https://github.com/YOUR_USERNAME/hotware-dashboard.git
git branch -M main
git push -u origin main
```

### Option 2: Manual GitHub Setup
1. **Go to GitHub.com** and log in
2. **Click "New Repository"**
   - Repository name: `hotware-dashboard`
   - Description: `Professional camera surveillance dashboard by Hotware`
   - Set to Public or Private
   - **Do NOT** initialize with README (we already have one)
3. **Copy the repository URL**
4. **Add remote and push:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/hotware-dashboard.git
git branch -M main
git push -u origin main
```

### 3. Verify GitHub Deployment
Visit `https://github.com/YOUR_USERNAME/hotware-dashboard` to see your deployed repository.

## 🦊 GitLab Deployment

### 1. Create GitLab Repository
```bash
# Add GitLab remote
git remote add gitlab https://gitlab.com/YOUR_USERNAME/hotware-dashboard.git

# Push to GitLab
git push -u gitlab main
```

### 2. Manual GitLab Setup
1. **Go to GitLab.com** and log in
2. **Click "New Project"**
3. **Select "Create blank project"**
   - Project name: `hotware-dashboard`
   - Description: `Professional camera surveillance dashboard by Hotware`
   - Visibility level: Choose as needed
4. **Follow the "Push an existing Git repository" instructions**

## 🪣 Bitbucket Deployment

### 1. Create Bitbucket Repository
```bash
# Add Bitbucket remote
git remote add bitbucket https://bitbucket.org/YOUR_USERNAME/hotware-dashboard.git

# Push to Bitbucket
git push -u bitbucket main
```

## 🌐 Hosting Platform Deployment

### Vercel Deployment (Recommended for Next.js)

#### Option 1: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? [Y/n] Y
# - Which scope? Select your account
# - Link to existing project? [y/N] N
# - Project name: hotware-dashboard
# - In which directory is your code located? ./
```

#### Option 2: GitHub Integration
1. **Go to [vercel.com](https://vercel.com)**
2. **Click "New Project"**
3. **Import from GitHub** (connect your account)
4. **Select `hotware-dashboard` repository**
5. **Configure:**
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: `npm run build`
   - Output Directory: Leave empty (default)
6. **Click "Deploy"**

### Netlify Deployment

#### Option 1: Netlify CLI
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy

# For production deployment
netlify deploy --prod
```

#### Option 2: GitHub Integration
1. **Go to [netlify.com](https://netlify.com)**
2. **Click "New site from Git"**
3. **Connect to GitHub**
4. **Select repository: `hotware-dashboard`**
5. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next` or `out`

### Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize and deploy
railway init
railway up
```

### DigitalOcean App Platform
1. **Go to DigitalOcean Console**
2. **Create App**
3. **Connect GitHub repository**
4. **Configure:**
   - Source: GitHub repository
   - Branch: main
   - Build Command: `npm run build`
   - Run Command: `npm start`

## ⚙️ Environment Configuration

### 1. Create Environment Files

**For Local Development (.env.local):**
```bash
# Camera System Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080/api
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws

# Branding
NEXT_PUBLIC_BRAND_NAME=Hotware
NEXT_PUBLIC_BRAND_LOGO=/images/hotware-logo.png

# Authentication (if implemented)
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Database (if implemented)
DATABASE_URL=postgresql://user:password@localhost:5432/hotware_db

# Optional: Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

**For Production (.env.production):**
```bash
# Production API endpoints
NEXT_PUBLIC_API_URL=https://api.hotware.com
NEXT_PUBLIC_WS_URL=wss://api.hotware.com/ws

# Production configuration
NEXT_PUBLIC_BRAND_NAME=Hotware
NEXTAUTH_URL=https://dashboard.hotware.com
```

### 2. Platform-Specific Environment Variables

#### Vercel
```bash
# Set via CLI
vercel env add NEXT_PUBLIC_API_URL
vercel env add NEXT_PUBLIC_WS_URL

# Or via dashboard at vercel.com/project-name/settings/environment-variables
```

#### Netlify
```bash
# Set via CLI
netlify env:set NEXT_PUBLIC_API_URL "your-api-url"

# Or via dashboard at app.netlify.com/sites/site-name/settings/deploys
```

## 🔄 CI/CD Pipeline Setup

### GitHub Actions (.github/workflows/deploy.yml)
```yaml
name: Deploy Hotware Dashboard

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm run test --if-present

    - name: Build project
      run: npm run build

    - name: Deploy to Vercel
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.ORG_ID }}
        vercel-project-id: ${{ secrets.PROJECT_ID }}
        vercel-args: '--prod'
```

### GitLab CI (.gitlab-ci.yml)
```yaml
stages:
  - build
  - deploy

variables:
  NODE_VERSION: "18"

build:
  stage: build
  image: node:18
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - .next/
    expire_in: 1 hour

deploy:
  stage: deploy
  image: node:18
  script:
    - npm install -g vercel
    - vercel --token $VERCEL_TOKEN --prod
  only:
    - main
```

## 🚀 Quick Deployment Commands

### Complete GitHub + Vercel Deployment
```bash
# 1. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/hotware-dashboard.git
git branch -M main
git push -u origin main

# 2. Deploy to Vercel
npx vercel --prod

# 3. Set environment variables
vercel env add NEXT_PUBLIC_API_URL
vercel env add NEXT_PUBLIC_WS_URL
```

### Complete GitLab + Netlify Deployment
```bash
# 1. Push to GitLab
git remote add origin https://gitlab.com/YOUR_USERNAME/hotware-dashboard.git
git push -u origin main

# 2. Deploy to Netlify
npx netlify-cli deploy --prod --dir=.next
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Build Failures
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json .next
npm install
npm run build
```

#### 2. Environment Variable Issues
```bash
# Check if variables are loaded
npm run dev
# Check browser console for NEXT_PUBLIC_ variables
```

#### 3. Git Authentication Issues
```bash
# Use personal access token for HTTPS
git remote set-url origin https://USERNAME:TOKEN@github.com/USERNAME/hotware-dashboard.git

# Or use SSH
git remote set-url origin git@github.com:USERNAME/hotware-dashboard.git
```

#### 4. Deployment Size Issues
```bash
# Optimize build
npm run build

# Check bundle analyzer
npm install @next/bundle-analyzer
```

## 📱 Mobile and PWA Deployment

### 1. Add PWA Support
```bash
npm install next-pwa
```

### 2. Configure PWA (next.config.js)
```javascript
const withPWA = require('next-pwa')({
  dest: 'public'
})

module.exports = withPWA({
  // your existing config
})
```

## 🔒 Security Considerations

### 1. Environment Variables
- Never commit `.env` files
- Use platform-specific secret management
- Rotate API keys regularly

### 2. Dependencies
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix
```

### 3. HTTPS Configuration
Ensure all production deployments use HTTPS and configure proper headers.

## 📊 Monitoring and Analytics

### 1. Add Error Tracking
```bash
# Sentry integration
npm install @sentry/nextjs
```

### 2. Performance Monitoring
- Use Vercel Analytics
- Google Analytics integration
- Custom monitoring dashboards

## 🆘 Support and Resources

### Documentation Links
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions](https://docs.github.com/en/actions)
- [GitLab CI/CD](https://docs.gitlab.com/ee/ci/)

### Community Support
- GitHub Issues: Use repository issues for bug reports
- Discord: Join Next.js and React communities
- Stack Overflow: Tag questions with `hotware-dashboard`

---

## 🎉 Deployment Complete!

Your Hotware Dashboard is now deployed and ready for production use. Remember to:

1. ✅ Set up monitoring and alerts
2. ✅ Configure backup strategies
3. ✅ Set up domain and SSL certificates
4. ✅ Implement user authentication
5. ✅ Connect to camera system APIs
6. ✅ Configure real-time data sources

**Happy monitoring! 🎯**