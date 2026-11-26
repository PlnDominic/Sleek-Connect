/**
 * Stand-ins for payment and messaging (the "test" payment provider, and "console" messages that are only logged) exist for
 * automated tests and local development. They are off unless ENABLE_TEST_MODES=true is set explicitly, and never run on a
 * Vercel production deployment whatever else is set. The live store sets neither.
 */
export function testModesAllowed(): boolean {
  return process.env.ENABLE_TEST_MODES === 'true' && process.env.VERCEL_ENV !== 'production';
}
