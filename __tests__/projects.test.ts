import { describe, test, expect } from 'vitest';
import { normalizeProjectMetadata } from '@/lib/project-metadata';

describe('projects metadata normalization', () => {
  test('coerces timestamp fields to numbers', () => {
    const project = normalizeProjectMetadata({
      projectName: 'demo-project',
      prompt: 'Build a landing page',
      createdAt: '1739235600000',
      updatedAt: '1739235600100',
      deployedAt: '1739235600200',
      status: 'completed',
      isPublished: true,
    });

    expect(project.createdAt).toBe(1739235600000);
    expect(project.updatedAt).toBe(1739235600100);
    expect(project.deployedAt).toBe(1739235600200);
  });
});
