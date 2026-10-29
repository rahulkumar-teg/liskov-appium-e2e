// L0: Android header map ↔ strings.xml + WeeklyEditionCovers.kt (plan §4.6, §4.23).
import assert from 'node:assert/strict';
import { androidHeaderMap } from '../../config/header-state.map.js';
import { parseStringsXml } from '../../src/contract/androidResources.js';
import { allMatches, normalise, parseAndroidRow } from '../../src/model/HeaderState.js';
import { liskov } from './_support.js';

describe('L0 header-state.contract (Android strings.xml ↔ config/header-state.map.ts)', () => {
  let strings: Map<string, string>;
  let rowFn: string;

  before(() => {
    strings = parseStringsXml(liskov().read('stringsXml'));
    const kt = liskov().read('weeklyEditionCovers');
    const start = kt.indexOf('private fun manualDownloadRowText(');
    assert.ok(start >= 0, 'manualDownloadRowText() not found in WeeklyEditionCovers.kt');
    const end = kt.indexOf('\nprivate fun ', start + 10);
    rowFn = kt.slice(start, end < 0 ? undefined : end);
  });

  it('strings.xml parses and contains the expected volume of strings', () => {
    assert.ok(strings.size > 100, `only ${strings.size} strings parsed`);
  });

  for (const e of androidHeaderMap) {
    it(`${e.state}: "${e.text}" is a prefix of strings.xml ${e.resource}`, () => {
      const v = strings.get(e.resource);
      assert.ok(v !== undefined, `resource ${e.resource} missing from strings.xml`);
      const nv = normalise(v);
      if (e.match === 'exact') assert.equal(nv, normalise(e.text));
      else assert.ok(nv.startsWith(normalise(e.text)), `strings.xml ${e.resource}="${v}" does not start with "${e.text}"`);
      if (e.actionResource) assert.ok(strings.has(e.actionResource), `action resource ${e.actionResource} missing`);
      if (e.action) assert.equal(normalise(strings.get(e.actionResource!) ?? ''), e.action, `action text for ${e.state}`);
    });
  }

  it('labelWithAction renders label + two spaces + action (WeeklyEditionCovers.kt)', () => {
    const kt = liskov().read('weeklyEditionCovers');
    const fn = kt.slice(kt.indexOf('private fun labelWithAction('));
    assert.match(fn.slice(0, 600), /append\(label\)\s*\n\s*append\(" {2}"\)\s*\n\s*withStyle\([\s\S]*?append\(action\)/, 'labelWithAction shape changed');
  });

  it('manualDownloadRowText() uses exactly the map\'s label/action resource pairs', () => {
    // Pairs from code: every labelWithAction(...) block → (label resources) + last resource = action.
    const codePairs = new Set<string>();
    for (const m of rowFn.matchAll(/labelWithAction\(([\s\S]*?)accent = accent/g)) {
      const res = [...(m[1] ?? '').matchAll(/R\.string\.(\w+)/g)].map((x) => x[1]!);
      assert.ok(res.length >= 2, `labelWithAction block without label/action: ${m[0].slice(0, 80)}`);
      const action = res[res.length - 1]!;
      for (const label of res.slice(0, -1)) codePairs.add(`${label}|${action}`);
    }
    const inBlocks = new Set([...codePairs].map((p) => p.split('|')[0]));
    for (const m of rowFn.matchAll(/AnnotatedString\(stringResource\([\w.]*R\.string\.(\w+)\)\)/g)) codePairs.add(`${m[1]}|-`);
    const mapPairs = new Set(androidHeaderMap.map((e) => `${e.resource}|${e.actionResource ?? '-'}`));
    assert.deepEqual([...mapPairs].sort(), [...codePairs].sort(), `code pairs: ${[...codePairs].join(', ')}; labels with action: ${[...inBlocks].join(',')}`);
  });

  describe('every rendered row string parses to its own state, and to exactly one', () => {
    for (const e of androidHeaderMap) {
      it(`${e.state}`, () => {
        const label = strings.get(e.resource)!;
        const rendered = e.actionResource ? `${label}  ${strings.get(e.actionResource)}` : label;
        assert.equal(parseAndroidRow(rendered), e.state, `rendered "${rendered}"`);
        assert.deepEqual(allMatches(rendered), [e.state], `rendered "${rendered}" matches several entries`);
      });
    }
  });

  it('unknown / near-miss texts parse to UNKNOWN (no silent pass)', () => {
    for (const s of ['', 'Downloaded', 'Download edition', 'Edition downloaded.  Manage', 'Print edition downloaded.  Delete', 'View print edition']) {
      assert.equal(parseAndroidRow(s), 'UNKNOWN', `"${s}"`);
    }
  });
});
