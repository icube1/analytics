import {
  createPortfolioDocument,
  readPortfolioDocument,
  listPortfolios,
  deletePortfolioDocument,
  writePortfolioDocument,
} from '../../lib/persist-server';
import { ensureDataDir, getDataDir } from '../../lib/project-paths';
import fs from 'fs';
import path from 'path';

describe('Persist Server', () => {
  const TEST_PORTFOLIO_ID = 'test-' + Date.now();

  beforeAll(() => {
    ensureDataDir();
  });

  afterAll(() => {
    try {
      deletePortfolioDocument(TEST_PORTFOLIO_ID);
    } catch {}
  });

  it('creates and reads a portfolio document', () => {
    const initialDoc = {
      id: TEST_PORTFOLIO_ID,
      groupId: 'test-group',
      brokerReport: { totalEquity: 100000 },
      brokerAccounts: [{ accountNumber: '12345678', accountType: 'checking' }],
      customAssets: { items: [{ assetNumber: 'ASSET-001' }] },
    };

    const created = createPortfolioDocument(TEST_PORTFOLIO_ID, initialDoc);
    expect(created.id).toBe(TEST_PORTFOLIO_ID);
    expect(created.groupId).toBe('test-group');
    expect(created.brokerAccounts).toHaveLength(2);

    const readDoc = readPortfolioDocument(TEST_PORTFOLIO_ID);
    expect(readDoc.id).toBe(TEST_PORTFOLIO_ID);
    expect(readDoc.brokerAccounts).toHaveLength(2);
  });

  it('lists all portfolios', () => {
    const all = listPortfolios();
    expect(Array.isArray(all)).toBe(true);
    expect(all.some(p => p.id === TEST_PORTFOLIO_ID)).toBe(true);
  });

  it('deletes a portfolio document', () => {
    const deleted = deletePortfolioDocument(TEST_PORTFOLIO_ID);
    expect(deleted).toBe(true);
    const stillExists = readPortfolioDocument(TEST_PORTFOLIO_ID);
    expect(stillExists.id).toBe('default');
  });

  it('handles group portfolios (summary)', () => {
    const summary = {
      id: 'summary',
      groupId: 'all',
      brokerReport: null,
      brokerAccounts: [],
      brokerSnapshots: [],
      debtBalanceHistory: [],
      forecastPlans: [],
      customAssets: { items: [], otherDebts: [] },
    };
    const docPath = path.join(getDataDir(), 'summary.json');
    fs.writeFileSync(docPath, JSON.stringify(summary, null, 2) + '\n');

    const listed = listPortfolios();
    expect(listed.some(p => p.id === 'summary')).toBe(true);

    fs.unlinkSync(docPath);
  });
});
