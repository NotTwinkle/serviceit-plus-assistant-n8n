# Contributing to Ivanti AI Assistant

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/yourusername/ivanti-ai-assistant.git
   cd ivanti-ai-assistant
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📝 Development Guidelines

### Code Style

- Use **TypeScript** for all new code
- Follow existing code style and patterns
- Use **ESLint** and **Prettier** (if configured)
- Write meaningful commit messages

### Project Structure

- `src/background/` - Background service worker
- `src/components/` - React UI components
- `src/content/` - Content scripts
- `src/types/` - TypeScript type definitions

### Testing

1. Build the extension: `npm run build`
2. Load in Chrome: `chrome://extensions/`
3. Test your changes in Ivanti Service Manager
4. Test both simple and complex queries

## 🔀 Pull Request Process

1. **Update documentation** if needed
2. **Add tests** if applicable
3. **Ensure build passes**: `npm run build`
4. **Update CHANGELOG.md** with your changes
5. **Create Pull Request** with clear description

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No console errors
- [ ] Tested in Chrome extension
- [ ] Tested with n8n workflow

## 🐛 Reporting Bugs

Use GitHub Issues with:

- **Clear title** and description
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Screenshots** if applicable
- **Environment info** (Chrome version, OS, etc.)

## 💡 Feature Requests

Open an issue with:

- **Use case** description
- **Proposed solution** (if any)
- **Alternatives considered**

## 📚 Documentation

- Update README.md for user-facing changes
- Update relevant .md files in root directory
- Add code comments for complex logic

## 🔐 Security

- **Never commit** API keys or credentials
- Use environment variables for sensitive data
- Report security issues privately

## 📝 Commit Messages

Use clear, descriptive commit messages:

```
feat: Add theme customization feature
fix: Resolve session persistence issue
docs: Update n8n setup guide
refactor: Simplify complexity analyzer
```

## 🤝 Code Review

- Be respectful and constructive
- Focus on code, not the person
- Suggest improvements, don't just criticize
- Respond to feedback promptly

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉

