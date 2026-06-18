# Contributing to Expense Tracker

Thank you for your interest in contributing to Expense Tracker! This document provides guidelines and instructions for contributing to the project.

##  Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

##  Code of Conduct

By participating in this project, you agree to:

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

##  Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- PostgreSQL 14+
- Git
- Code editor (VS Code recommended)

### Setup

1. **Fork the Repository**
   ```bash
   # Click the "Fork" button on GitHub, then clone your fork:
   git clone https://github.com/YOUR_USERNAME/Expense-Tracker.git
   cd Expense-Tracker
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Initialize Database**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

##  Development Workflow

### Branching Strategy

We use Git Flow:

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `hotfix/*` - Critical production fixes
- `docs/*` - Documentation updates

### Creating a Feature Branch

```bash
# Update your fork
git checkout develop
git pull upstream develop

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and commit
git add .
git commit -m "feat: add amazing feature"

# Push to your fork
git push origin feature/amazing-feature
```

##  Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define interfaces for all data structures
- Use strict type checking
- Avoid `any` type unless absolutely necessary

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// Bad
function getUser(id: any): any {
  // ...
}
```

### React Components

- Use functional components with hooks
- Keep components focused and single-responsibility
- Extract reusable logic into custom hooks
- Use proper prop typing

```typescript
// Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return (
    <button onClick={onClick} className={`btn btn-${variant}`}>
      {label}
    </button>
  );
};

// Bad
export const Button = (props: any) => {
  return <button {...props} />;
};
```

### File Structure

```
frontend/src/
 app/
    components/        # React components
        Dashboard.tsx
        ui/           # Reusable UI components
 contexts/             # React contexts
 hooks/                # Custom hooks
 lib/                  # Utilities and helpers
 types/                # TypeScript types
 constants/            # Constants and config
 utils/                # Helper functions
```

### Naming Conventions

- **Components**: PascalCase (`Dashboard.tsx`, `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`, `useLocalStorage.ts`)
- **Utilities**: camelCase (`formatDate.ts`, `api.ts`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRY_ATTEMPTS`)
- **Types/Interfaces**: PascalCase (`User`, `ApiResponse`)

### CSS/Styling

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Keep custom CSS minimal
- Use CSS variables for theme colors

```tsx
// Good
<div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800">
  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
    Title
  </h1>
</div>

// Avoid inline styles unless necessary
<div style={{ padding: '16px' }}> // Bad
```

##  Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
# Feature
git commit -m "feat(auth): add JWT authentication"

# Bug fix
git commit -m "fix(transactions): correct balance calculation"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Breaking change
git commit -m "feat(api): change response format

BREAKING CHANGE: API responses now use camelCase instead of snake_case"
```

##  Pull Request Process

### Before Submitting

1. **Test Your Changes**
   ```bash
   npm run test
   npm run type-check
   npm run lint
   ```

2. **Update Documentation**
   - Update relevant README files
   - Add JSDoc comments to functions
   - Update API documentation if needed

3. **Check for Conflicts**
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout your-branch
   git rebase develop
   ```

### PR Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots or GIFs

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings introduced
```

### Review Process

1. Automated checks must pass
2. At least one approval required
3. No merge conflicts
4. All conversations resolved
5. Documentation updated

##  Testing Guidelines

### Unit Tests

```typescript
// Example test
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('should format USD correctly', () => {
    expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
  });

  it('should handle zero values', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });
});
```

### Integration Tests

```typescript
// Example API test
describe('POST /api/v1/transactions', () => {
  it('should create a new transaction', async () => {
    const response = await request(app)
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        amount: 100,
        category: 'food',
      })
      .expect(201);

    expect(response.body.data).toHaveProperty('id');
  });
});
```

### Test Coverage

- Aim for >80% code coverage
- Focus on critical paths
- Include edge cases
- Test error handling

##  Documentation

### Code Comments

```typescript
/**
 * Calculates the compound interest for an investment
 * @param principal - Initial investment amount
 * @param rate - Annual interest rate (as decimal)
 * @param time - Time period in years
 * @param frequency - Compounding frequency per year
 * @returns The final amount including interest
 */
export function calculateCompoundInterest(
  principal: number,
  rate: number,
  time: number,
  frequency: number = 12
): number {
  return principal * Math.pow(1 + rate / frequency, frequency * time);
}
```

### README Updates

When adding features:

1. Update main README.md
2. Add to FEATURES.md
3. Update relevant documentation
4. Add examples and usage

##  Bug Reports

### Creating Issues

When reporting bugs, include:

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Screenshots
If applicable

## Environment
- OS: [e.g., Windows 11]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 1.0.0]

## Additional Context
Any other relevant information
```

##  Feature Requests

### Proposing Features

```markdown
## Feature Description
Clear description of the feature

## Problem It Solves
What problem does this solve?

## Proposed Solution
How would you implement this?

## Alternatives Considered
What other approaches did you consider?

## Additional Context
Mockups, examples, references
```

##  Development Principles

### Keep It Modular

- Single responsibility principle
- Reusable components
- Clear interfaces
- Loose coupling

### Performance First

- Lazy load components
- Optimize re-renders
- Use memoization when appropriate
- Monitor bundle size

### Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Screen reader support

### Security

- Validate inputs
- Sanitize outputs
- Use environment variables
- Don't commit secrets

##  Getting Help

-  [GitHub Discussions](https://github.com/Alpha-ashu/Expense-Tracker/discussions)
-  [Issue Tracker](https://github.com/Alpha-ashu/Expense-Tracker/issues)
-  Email: support@expensetracker.app

##  Thank You!

Your contributions make this project better. We appreciate your time and effort!

---

**Questions?** Feel free to ask in [Discussions](https://github.com/Alpha-ashu/Expense-Tracker/discussions)
