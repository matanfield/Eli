# Eli - Voice-First Language Learning

A conversational AI language tutor that teaches through natural voice conversations and sentence-based learning.

## Overview

Eli is a React Native mobile app that provides:
- **Voice-first learning**: Speak with an AI tutor in real-time
- **Sentence-based approach**: Learn through focused sentence practice
- **Conversational feedback**: Get pronunciation and grammar corrections
- **Progressive difficulty**: Adaptive learning based on your progress

## Tech Stack

- **Frontend**: Expo React Native (TypeScript)
- **Backend**: Vercel serverless functions
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: OpenAI Realtime API for voice conversations
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Expo CLI
- iOS Simulator or Android Emulator

### Installation

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm start

# Run on iOS simulator
pnpm ios

# Run on Android emulator  
pnpm android
```

### Development

```bash
# Start with dev client (for native builds)
pnpm start --dev-client

# Reset Metro cache
pnpm start --reset-cache
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # Screen components
├── services/       # API and external service integrations
├── lib/           # Utilities and helpers
└── types/         # TypeScript type definitions

assets/            # Images, icons, fonts
documentation/     # Project specifications and plans
```

## Features (MVP)

- [x] Voice-first conversation interface
- [x] Real-time speech processing
- [x] Sentence-based learning loop
- [x] User progress tracking
- [ ] Supabase authentication
- [ ] OpenAI Realtime API integration
- [ ] Progress persistence

## Environment Setup

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

## Contributing

This is an MVP in active development. See `documentation/` for detailed specifications and build plans.

## License

Private project - All rights reserved.
