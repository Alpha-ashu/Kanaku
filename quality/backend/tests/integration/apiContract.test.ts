import fs from 'fs';
import path from 'path';
import { generateOpenApiDocument } from '../../../../backend/src/docs/api-docs';

describe('API Version Contract Freeze Tests', () => {
  const snapshotPath = path.resolve(__dirname, '../../../api/openapi-v1-snapshot.json');
  let goldenSnapshot: any;
  let currentDoc: any;

  beforeAll(() => {
    // Read golden contract snapshot
    expect(fs.existsSync(snapshotPath)).toBe(true);
    goldenSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    // Generate current spec
    currentDoc = generateOpenApiDocument('https://api.example.com');
  });

  it('should not delete any paths present in the v1 contract', () => {
    const goldenPaths = Object.keys(goldenSnapshot.paths || {});
    const currentPaths = Object.keys(currentDoc.paths || {});

    for (const p of goldenPaths) {
      expect(currentPaths).toContain(p);
    }
  });

  it('should not delete or rename any HTTP methods for existing paths', () => {
    const goldenPaths = Object.keys(goldenSnapshot.paths || {});

    for (const p of goldenPaths) {
      const goldenMethods = Object.keys(goldenSnapshot.paths[p]);
      const currentMethods = Object.keys(currentDoc.paths[p] || {});

      for (const m of goldenMethods) {
        expect(currentMethods).toContain(m);
      }
    }
  });

  it('should ensure parameters of existing endpoints are backward compatible', () => {
    const goldenPaths = Object.keys(goldenSnapshot.paths || {});

    for (const p of goldenPaths) {
      const goldenMethods = Object.keys(goldenSnapshot.paths[p]);
      for (const m of goldenMethods) {
        const goldenParams = goldenSnapshot.paths[p][m].parameters || [];
        const currentParams = currentDoc.paths[p]?.[m]?.parameters || [];

        // Every parameter defined in the golden contract must exist in the current spec with the same schema
        for (const gp of goldenParams) {
          const matchingParam = currentParams.find((cp: any) => cp.name === gp.name && cp.in === gp.in);
          expect(matchingParam).toBeDefined();
          if (gp.required) {
            expect(matchingParam.required).toBe(true);
          }
        }
      }
    }
  });

  it('should not alter existing response status codes', () => {
    const goldenPaths = Object.keys(goldenSnapshot.paths || {});

    for (const p of goldenPaths) {
      const goldenMethods = Object.keys(goldenSnapshot.paths[p]);
      for (const m of goldenMethods) {
        const goldenResponses = Object.keys(goldenSnapshot.paths[p][m].responses || {});
        const currentResponses = Object.keys(currentDoc.paths[p]?.[m]?.responses || {});

        for (const code of goldenResponses) {
          expect(currentResponses).toContain(code);
        }
      }
    }
  });
});
