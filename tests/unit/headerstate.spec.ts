import assert from 'node:assert/strict';
import { iosManageState, parseAndroidRow, parseAndroidRowOrPartial, parseIOSLabel } from '../../src/model/HeaderState.js';

// Header-state parsing incl. Manage-only (partially downloaded) — Rahul 2026-10-29 10:24: never NOTHING.
describe('HeaderState parsing', () => {
  it('iOS status labels without the action text', () => {
    assert.equal(parseIOSLabel('Print edition downloaded.'), 'PRINT_DONE');
    assert.equal(parseIOSLabel('Articles & audio downloaded.'), 'AA_DONE');
    assert.equal(parseIOSLabel('Edition downloaded'), 'BOTH_DONE');
    assert.equal(parseIOSLabel('Download'), 'NOTHING');
  });
  it('iOS Manage visible: named format, else PARTIAL_DONE (never NOTHING)', () => {
    assert.equal(iosManageState(['Print edition downloaded.', '']), 'PRINT_DONE');
    assert.equal(iosManageState(['', 'Articles & audio downloaded.']), 'AA_DONE');
    assert.equal(iosManageState(['', '']), 'PARTIAL_DONE');
    assert.equal(iosManageState(['Download']), 'PARTIAL_DONE');
  });
  it('Android row: known strings unchanged; unparsed row offering Manage is PARTIAL_DONE', () => {
    assert.equal(parseAndroidRowOrPartial('Print edition downloaded.  Manage'), 'PRINT_DONE');
    assert.equal(parseAndroidRowOrPartial('Download'), 'NOTHING');
    assert.equal(parseAndroidRowOrPartial('Manage'), 'PARTIAL_DONE');
    assert.equal(parseAndroidRowOrPartial('Some downloaded.  Manage'), 'PARTIAL_DONE');
    assert.equal(parseAndroidRowOrPartial('Something else'), 'UNKNOWN');
    assert.equal(parseAndroidRow('Manage'), 'UNKNOWN');
  });
});
