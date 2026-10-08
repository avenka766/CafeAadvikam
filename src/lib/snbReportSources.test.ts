import { expect, it } from 'vitest';
import { snbReportSources } from './snbReportSources';
it('History loads only its canonical sales register', () => {
  expect(snbReportSources('history')).toEqual([14]);
});
it('operational tabs do not start financial reports in the background', () => {
  for (const tab of ['stock','quotations','credit','current-cash','bank']) expect(snbReportSources(tab)).toEqual([]);
});
it('closure loads sessions and daily closure without item/category scans', () => {
  expect(snbReportSources('closure')).toEqual([1,2]);
});
