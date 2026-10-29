// L0: every Android `id=` locator exists in TestTagConstants.kt; every iOS `~` id exists in AccessibilityIds.swift;
// text-matched Android locators equal the value of their bound strings.xml resource (plan §4.23).
import assert from 'node:assert/strict';
import { androidDownload, androidSettings, androidTextResources } from '../../src/locators/android/download.js';
import { iosDownload, iosSettings } from '../../src/locators/ios/download.js';
import { iosAccount, iosPaywall, iosViewer, iosWeekly } from '../../src/locators/ios/viewer.js';
import { androidPaywall, androidViewer } from '../../src/locators/android/viewer.js';
import { parseStringsXml } from '../../src/contract/androidResources.js';
import { liskov } from './_support.js';

const literals = (src: string) => new Set([...src.matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1]!));

describe('L0 locators.contract', () => {
  it('source files contain id literals', () => {
    assert.ok(literals(liskov().read('iosAccessibilityIds')).size > 100);
    assert.ok(literals(liskov().read('androidTestTags')).size > 100);
  });

  describe('iOS ~ids ⊂ AccessibilityIds.swift', () => {
    for (const [name, loc] of Object.entries({ ...iosDownload, ...iosSettings, ...iosViewer, ...iosWeekly, ...iosAccount, ...iosPaywall })) {
      if (!loc.startsWith('~')) continue;
      it(`${name} ${loc}`, () => assert.ok(literals(liskov().read('iosAccessibilityIds')).has(loc.slice(1)), `${loc} not in AccessibilityIds.swift`));
    }
  });

  describe('Android id= ⊂ TestTagConstants.kt', () => {
    for (const [name, loc] of Object.entries({ ...androidDownload, ...androidSettings, ...androidViewer, ...androidPaywall })) {
      if (!loc.startsWith('id=')) continue;
      it(`${name} ${loc}`, () => assert.ok(literals(liskov().read('androidTestTags')).has(loc.slice(3)), `${loc} not in TestTagConstants.kt`));
    }
  });

  describe('Android text locators == their strings.xml resource values', () => {
    for (const [name, loc] of Object.entries(androidDownload)) {
      const m = /\.text\("([^"]+)"\)/.exec(loc);
      if (!m) continue;
      it(`${name} "${m[1]}"`, () => {
        const res = androidTextResources[name as keyof typeof androidDownload];
        assert.ok(res && res.length > 0, `${name}: text locator has no backing resource in androidTextResources`);
        const xml = parseStringsXml(liskov().read('stringsXml'));
        for (const r of res) assert.equal(xml.get(r), m[1], `strings.xml ${r} ≠ "${m[1]}"`);
      });
    }
  });

  it('every locator kind is one the contract understands (no unchecked locator slips through)', () => {
    const all = [...Object.values(iosDownload), ...Object.values(iosSettings), ...Object.values(iosViewer), ...Object.values(iosWeekly), ...Object.values(iosAccount), ...Object.values(iosPaywall), ...Object.values(androidDownload), ...Object.values(androidSettings), ...Object.values(androidViewer), ...Object.values(androidPaywall)];
    const unchecked = all.filter((l) => !l.startsWith('~') && !l.startsWith('id=') && !/\.text\("/.test(l) && !l.startsWith('-ios predicate string:'));
    assert.deepEqual(unchecked, []);
  });
});
