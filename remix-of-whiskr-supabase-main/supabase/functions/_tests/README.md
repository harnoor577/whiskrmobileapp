# Edge Function Tests

Automated tests for Supabase Edge Functions to catch errors before deployment.

## Running Tests

```bash
# Run all tests
deno test --allow-env --allow-net supabase/functions/_tests/

# Run specific test file
deno test --allow-env --allow-net supabase/functions/_tests/process-stripe-refund.test.ts

# Run with coverage
deno test --allow-env --allow-net --coverage=coverage supabase/functions/_tests/
deno coverage coverage
```

## Test Structure

- `test-helpers.ts` - Shared utilities and mocks
- `*.test.ts` - Individual test files for each edge function

## What We Test

1. **Database Query Errors**: Using `.maybeSingle()` instead of `.single()`
2. **Missing Records**: Proper error handling when records don't exist
3. **Authentication**: Proper auth checks and error messages
4. **Input Validation**: Required parameters and data format
5. **Error Messages**: Clear, descriptive error messages

## Adding New Tests

1. Create a new test file: `supabase/functions/_tests/your-function.test.ts`
2. Import test helpers and mocks
3. Write test cases covering success and error scenarios
4. Run tests before deployment

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
- name: Test Edge Functions
  run: deno test --allow-env --allow-net supabase/functions/_tests/
```
