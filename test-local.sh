#!/bin/bash

# Local testing script for Smartcar webhook
echo "🚀 Starting local webhook testing..."

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found. Please create it with:"
    echo "   POSTGRES_URL=your_database_url"
    echo "   SMARTCAR_WEBHOOK_SECRET=your_webhook_secret"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run database migrations
echo "🗄️  Running database migrations..."
npm run db:push

# Start the dev server in background
echo "🌐 Starting development server..."
npm run dev &
DEV_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Test the webhook
echo "🧪 Testing webhook..."
node test-webhook.js

# Clean up
echo "🧹 Stopping development server..."
kill $DEV_PID

echo "✅ Testing complete!"
