import {
  assertStorage,
  ATTACHMENT_PATH,
  attachmentPath,
  cleanFileName,
  formatBytes,
} from './attachment-rules.js';

const free = { name: 'Free', maxStorageBytes: 100n * 1024n * 1024n };
const MB = 1024n * 1024n;

describe('assertStorage', () => {
  it('allows uploads that fit into the plan', () => {
    expect(() => assertStorage(free, 90n * MB, 10n * MB)).not.toThrow();
  });

  it('explains when the plan storage would be exceeded', () => {
    expect(() => assertStorage(free, 95n * MB, 10n * MB)).toThrow(
      'The Free plan allows up to 100 MB of storage. Upgrade the plan to add more.',
    );
  });

  it('never limits plans without a storage cap', () => {
    expect(() =>
      assertStorage({ name: 'Team', maxStorageBytes: null }, 10n ** 15n, MB),
    ).not.toThrow();
  });
});

describe('cleanFileName', () => {
  it('keeps only the base name without control characters', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\photos\\cat\u0000\u202e.png')).toBe('cat.png');
  });

  it('falls back to a default name', () => {
    expect(cleanFileName('   ')).toBe('image');
  });
});

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB');
    expect(formatBytes(10n * 1024n * 1024n * 1024n)).toBe('10 GB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('attachment path', () => {
  it('matches only attachment content URLs', () => {
    const id = '01a16800-0000-7000-8000-000000000001';
    expect(ATTACHMENT_PATH.test(attachmentPath(id))).toBe(true);
    expect(ATTACHMENT_PATH.test(`${attachmentPath(id)}?x=1`)).toBe(false);
    expect(ATTACHMENT_PATH.test('/api/attachments/../auth/logout')).toBe(false);
  });
});
