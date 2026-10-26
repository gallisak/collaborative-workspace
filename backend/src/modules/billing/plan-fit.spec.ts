import { planMisfit } from './plan-fit.js';

const pro = { name: 'Pro', maxMembers: 10, maxDocuments: null, maxStorageBytes: 10n * 1024n ** 3n };
const usage = { members: 10, documents: 5000, storageBytes: 1024n };

describe('planMisfit', () => {
  it('accepts a workspace that fits the plan', () => {
    expect(planMisfit(pro, usage)).toBeNull();
  });

  it('rejects too many members', () => {
    expect(planMisfit(pro, { ...usage, members: 11 })).toMatch(/up to 10 members.*has 11/);
  });

  it('rejects too many documents', () => {
    expect(planMisfit({ ...pro, maxDocuments: 100 }, { ...usage, documents: 101 })).toMatch(
      /up to 100 documents/,
    );
  });

  it('rejects storage above the plan', () => {
    expect(planMisfit(pro, { ...usage, storageBytes: 11n * 1024n ** 3n })).toMatch(
      /includes 10 GB of storage, the workspace uses 11 GB/,
    );
  });
});
