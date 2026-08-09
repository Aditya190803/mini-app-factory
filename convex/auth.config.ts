import { getConvexProvidersConfig } from '@stackframe/stack';

const projectId = process.env.NEXT_PUBLIC_STACK_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_STACK_PROJECT_ID is not set for the Convex deployment');
}

export default {
  providers: getConvexProvidersConfig({ projectId }),
};
