# Frontend Checklist — Refacil Team

> Complements the [general checklist](checklist.md). Applies to **frontend** repositories (web, mobile, desktop applications with UI).
> Detection: if the project has UI component structure, client-side state management, routes/views, or consumes APIs to render interfaces, apply this checklist.

## F1. Components and structure
- Components have a single responsibility (do not mix business logic with presentation)
- Complex logic is separated into helper functions, services, or the framework's reuse pattern
- Reusable components are in the project's shared folder (consult AGENTS.md)
- No excessively large components (> 200 lines as a guideline — consider extracting)

## F2. State and data
- State is managed at the closest level to where it is needed (avoid passing data unnecessarily through multiple levels)
- No duplicated or derivable state that can be calculated
- API calls use the pattern established in the project (consult AGENTS.md)
- All 4 states of each data-consuming view are handled: loading, error, empty, and with data

## F3. Error handling in UI
- Error handling exists at the component or section level (so the entire app does not crash due to a widget error)
- Error screens show clear visual feedback to the user (never blank or broken screens)
- Unexpected errors are captured and logged (if the project has a monitoring service)
- No errors or warnings in the browser console during normal flows

## F4. API integration
- Network states are handled: retries, timeout, disconnection
- Requests are cancelled when unmounting the component or navigating away (avoid state updates in already-destroyed components)
- Long lists use pagination or infinite scroll with incremental loading
- Duplicate or unnecessary calls to the same endpoint are avoided

## F5. Form validation
- Forms validate user input before submitting
- Error messages are clear and in the user's language
- Double submission is prevented (disable button, loading state)

## F6. Routing and navigation
- Protected routes validate authentication/authorization before rendering
- Handling of not-found routes exists (404 screen or redirect)
- Deep linking works correctly (accessing an internal URL directly)
- Post-login/logout redirects are correct

## F7. Visual consistency
- The project's design system components and tokens are used (consult AGENTS.md)
- The defined spacing and typography scale is respected
- No unnecessary inline styles if the project has a defined style system
- Icons and images are optimized (appropriate formats, correct sizes)
- No hardcoded text if the project uses internationalization (i18n)
- The UI is responsive if applicable to the project

## F8. Frontend performance
- No unnecessary re-renders (use the framework's memoization/optimization techniques)
- Code splitting / lazy loading of heavy routes or modules
- Images use lazy loading
- Optimized fonts (preload, fallback defined)
- No heavy dependencies loaded unnecessarily (evaluate bundle size)
- No duplicate dependencies in the bundle
- Long lists use virtualization if applicable

## F9. Accessibility (a11y)
- Interactive elements have accessible labels (labels, alternative texts, ARIA roles)
- Keyboard navigation works correctly
- Color contrast is adequate
- Touch targets have an adequate minimum size (44x44px as a guideline)

## F10. Frontend security
- No sensitive data exposed on the client (tokens, secrets, API keys in source code)
- Inputs are sanitized to prevent XSS
- Tokens or sensitive data are not stored in client storage without adequate protection

## F11. Frontend testing
- User interaction tests (clicks, forms, navigation)
- Tests for all 4 visual states (loading, error, empty, with data)
- Tests verify user behavior, not implementation details
