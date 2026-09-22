# Driver registration without a phone

The fleet operator supplied driver names and truck plates without telephone numbers.
Manual registration should accept an omitted or empty phone, matching document import.
Supplied phone numbers must still use international format, and writes require an authenticated administrator.

## Evidence

- RED: `node --import tsx --test tests/drivers.test.ts` failed with `400 !== 201` for an omitted phone.
- GREEN: `npm test` passed all 33 tests, including omitted/empty/valid phones, invalid phone rejection and unauthenticated write rejection.
- `npm run build` completed, including lint and TypeScript validation.
- Database calls in the new test are mocked; no external API is consumed.
- Database integration coverage and aggregate coverage percentages were not measured in this change.

Production fleet associations are operational data and are not included in source files.
