import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentError, loadContent, toPublicClient } from './content.js';
import { CONTENT_DIR } from './paths.js';

// --- helpers: each broken-content test works on its own copy of the real content ---

const tempDirs: string[] = [];

function copyOfRealContent(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bank-sim-content-'));
  cpSync(CONTENT_DIR, dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Loosely typed on purpose: these tests deliberately write invalid content. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editJson(dir: string, file: string, edit: (data: any) => void): void {
  const fullPath = path.join(dir, file);
  const data = JSON.parse(readFileSync(fullPath, 'utf8'));
  edit(data);
  writeFileSync(fullPath, JSON.stringify(data));
}

function problemsIn(dir: string): string[] {
  try {
    loadContent(dir);
  } catch (err) {
    if (err instanceof ContentError) return err.problems;
    throw err;
  }
  throw new Error('Expected the content to be rejected, but it loaded');
}

// ---------------------------------------------------------------------------

describe('loadContent with the real content files', () => {
  const content = loadContent();

  it('loads all clients and products', () => {
    expect(content.bank.name).toBe('Pearl Coast Bank');
    expect(content.products).toHaveLength(9);
    expect(content.clients.map((c) => c.id)).toEqual(['maria', 'ahmed', 'noura']);
  });

  it('gives every client at least one critical need', () => {
    for (const client of content.clients) {
      expect(client.needs.some((n) => n.importance === 'critical')).toBe(true);
    }
  });

  it('finds clients and products by id', () => {
    expect(content.getClient('ahmed')?.profile.name).toBe('Ahmed Al-Sayed');
    expect(content.getClient('nobody')).toBeUndefined();
    expect(content.getProduct('wakala-term-deposit')?.shariaCompliant).toBe(true);
  });
});

describe('toPublicClient', () => {
  const content = loadContent();

  it('only includes fields meant for the student', () => {
    for (const client of content.clients) {
      expect(Object.keys(toPublicClient(client)).sort()).toEqual(
        [
          'age',
          'difficulty',
          'id',
          'location',
          'name',
          'occupation',
          'openingLine',
          'summary',
        ].sort(),
      );
    }
  });

  it('never contains hidden needs, background or personality', () => {
    for (const client of content.clients) {
      const json = JSON.stringify(toPublicClient(client));
      expect(json).not.toContain(client.profile.background);
      expect(json).not.toContain(client.profile.personality);
      for (const need of client.needs) expect(json).not.toContain(need.description);
    }
  });
});

describe('loadContent with broken content', () => {
  it('names the file and field when a required field is missing', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'clients/maria/hidden-needs.json', (d) => delete d.needs[1].revealWhen);

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining('clients/maria/hidden-needs.json → needs[1].revealWhen'),
    ]);
  });

  it('reports misspelt field names instead of ignoring them', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'clients/ahmed/profile.json', (d) => {
      d.openingline = d.openingLine;
      delete d.openingLine;
    });

    const problems = problemsIn(dir).join('\n');
    expect(problems).toContain('clients/ahmed/profile.json');
    expect(problems).toContain('openingline');
  });

  it('rejects a product id that is not in the catalogue', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'clients/noura/hidden-needs.json', (d) => {
      d.productFit.suitable[0].productId = 'golden-savings-plan';
    });

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining('unknown product id "golden-savings-plan"'),
    ]);
  });

  it('rejects a product listed as both suitable and unsuitable', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'clients/ahmed/hidden-needs.json', (d) => {
      d.productFit.unsuitable.push({ productId: 'tijara-business-account', reason: 'test' });
    });

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining(
        '"tijara-business-account" is listed in both "suitable" and "unsuitable"',
      ),
    ]);
  });

  it('rejects duplicate product ids', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'products.json', (d) => d.products.push({ ...d.products[0] }));

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining('product id "tijara-business-account" is used more than once'),
    ]);
  });

  it('reports invalid JSON with the file name', () => {
    const dir = copyOfRealContent();
    writeFileSync(path.join(dir, 'clients/maria/profile.json'), '{ "name": "Maria", }');

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining('clients/maria/profile.json: not valid JSON'),
    ]);
  });

  it('reports a missing hidden-needs file', () => {
    const dir = copyOfRealContent();
    unlinkSync(path.join(dir, 'clients/noura/hidden-needs.json'));

    expect(problemsIn(dir)).toEqual(['clients/noura/hidden-needs.json: file is missing']);
  });

  it('rejects a client folder name that cannot be used as an id', () => {
    const dir = copyOfRealContent();
    cpSync(path.join(dir, 'clients/maria'), path.join(dir, 'clients/New Client'), {
      recursive: true,
    });

    expect(problemsIn(dir)).toEqual([
      expect.stringContaining('clients/New Client: folder name must be lowercase'),
    ]);
  });

  it('reports every problem at once, not just the first', () => {
    const dir = copyOfRealContent();
    editJson(dir, 'clients/maria/profile.json', (d) => (d.age = 'twenty-nine'));
    editJson(dir, 'clients/ahmed/hidden-needs.json', (d) => (d.needs[0].importance = 'urgent'));
    unlinkSync(path.join(dir, 'clients/noura/profile.json'));

    expect(problemsIn(dir)).toHaveLength(3);
  });

  it('reports an empty clients folder', () => {
    const dir = copyOfRealContent();
    rmSync(path.join(dir, 'clients'), { recursive: true });
    mkdirSync(path.join(dir, 'clients'));

    expect(problemsIn(dir)).toEqual([expect.stringContaining('no clients found')]);
  });
});
