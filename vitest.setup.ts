// Set up environment variables before any modules are loaded
process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://test.convex.cloud';
process.env.CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || 'test-key';
process.env.NEXT_PUBLIC_STACK_PROJECT_ID = process.env.NEXT_PUBLIC_STACK_PROJECT_ID || 'stack-project';
process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY || 'stack-client';
process.env.STACK_SECRET_SERVER_KEY = process.env.STACK_SECRET_SERVER_KEY || 'stack-secret';
process.env.INTEGRATION_TOKEN_SECRET = process.env.INTEGRATION_TOKEN_SECRET || '12345678901234567890123456789012';
