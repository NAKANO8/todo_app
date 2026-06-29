# Research Log: frontend-screen-tests

## Discovery Scope
- Feature type: Simple Addition (test files for 5 existing UI components)
- Discovery process: Light (existing infrastructure already configured)

## Key Findings

### Existing Test Infrastructure
- Vitest 4.1.9 + jsdom 29.1.1 configured in `todo-web/vitest.config.ts`
- `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.1, `@testing-library/jest-dom` 6.9.1 installed
- Pattern established: `_test_/` subdirectory co-located with component under test
- One existing test: `components/todo/_test_/InputTodo.test.tsx`

### Component Analysis

#### LandingPage
- Static component; no API calls, no state
- Uses `next/link` for `/login` and `/register` navigation links
- Requires `next/link` mock for RTL since Next.js router context is unavailable in jsdom

#### LoginForm
- `'use client'` component with `useState`
- Client-side validation via `lib/validation.ts` (pure functions, no mock needed)
- Uses `e.currentTarget.submit()` for actual form submission → jsdom's `HTMLFormElement.submit()` is a no-op, making validation tests straightforward
- `next/link` used for cross-mode navigation links

#### TodoApp
- `'use client'` component with `useEffect` (initial fetch) and async CRUD handlers
- Depends on `@/lib/api/todos` (fetchTodos, createTodo, updateTodo, deleteTodo) — must be mocked
- Depends on `react-toastify` (toast.error) — must be mocked to prevent jsdom rendering issues
- 5-item incomplete limit triggers button disable and warning message

#### CompleteTodos / IncompleteTodos
- Pure presentational components; accept todos + callback props
- No external dependencies; no mocking required

### Design Decisions

#### D1: next/link Mock Strategy
- Mock `next/link` to render a plain `<a href={href}>{children}</a>` element
- Rationale: Next.js router context is unavailable in jsdom; without mock, Link may throw or fail to render href
- Applied in: LandingPage.test.tsx, LoginForm.test.tsx

#### D2: API Mock Strategy for TodoApp
- Mock entire `@/lib/api/todos` module via `vi.mock('@/lib/api/todos')`
- `fetchTodos` returns a resolved Promise with fixture data
- `createTodo`, `updateTodo`, `deleteTodo` return resolved Promises (void)
- After mutation operations, `fetchTodos` is called again by TodoApp to refresh — mock must account for this (second call returns updated state)
- Use `beforeEach` to reset mocks between tests

#### D3: react-toastify Mock
- Mock `react-toastify` to no-op to avoid portal rendering issues in jsdom
- `toast.error` mocked as `vi.fn()`

#### D4: Async Test Strategy for TodoApp
- `useEffect` with `fetchTodos` runs after render → use `await waitFor()` to wait for state updates
- Mutation handlers are async → use `await userEvent.click()` then `waitFor()`

#### D5: No Production Code Changes
- All test infrastructure already in place; zero production file modifications required
