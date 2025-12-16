# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-XX

### Added
- Intelligent routing system (Ollama + Gemini)
- Complexity analyzer using Gemini
- Redis Vector Store integration for RAG
- Redis Chat Memory for session-based history
- Ivanti API tool for ticket data retrieval
- n8n workflow with intelligent routing
- Theme customization with live preview
- Session management across browser restarts
- Logout detection and cleanup
- Conversation history management
- User identity verification
- Context extraction from Ivanti pages

### Changed
- Migrated from direct AI calls to n8n backend
- Simplified background service worker
- Improved error handling
- Enhanced conversation management

### Fixed
- Session persistence issues
- Memory leaks on logout
- Conversation history cleanup

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Basic AI chat interface
- Direct AI integration
- Theme customization

---

[2.0.0]: https://github.com/yourusername/ivanti-ai-assistant/releases/tag/v2.0.0
[1.0.0]: https://github.com/yourusername/ivanti-ai-assistant/releases/tag/v1.0.0

