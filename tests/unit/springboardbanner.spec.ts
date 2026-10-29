import assert from 'node:assert/strict';
import { springboardBanner } from '../../src/model/SpringboardBanner.js';

const rest = `<XCUIElementTypeApplication type="XCUIElementTypeApplication" name=" " visible="true" accessible="false" x="0" y="0" width="402" height="874">
  <XCUIElementTypeWindow type="XCUIElementTypeWindow" visible="false" accessible="false" x="0" y="0" width="402" height="874">
    <XCUIElementTypeStatusBar type="XCUIElementTypeStatusBar" visible="true" accessible="false" x="0" y="0" width="402" height="54">
      <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" name="11:10 AM" label="11:10 AM" visible="true" accessible="true" x="54" y="22" width="40" height="21"/>
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="Return to Slack" label="Slack" visible="true" accessible="true" x="10" y="22" width="40" height="21"/>
    </XCUIElementTypeStatusBar>
    <XCUIElementTypeOther type="XCUIElementTypeOther" name="AppSwitcherContentView" visible="false" accessible="false" x="0" y="0" width="402" height="874"/>
  </XCUIElementTypeWindow>
`;
describe('springboardBanner (SpringBoard dump parser)', () => {
  it('at rest (status bar only, incl. breadcrumb) → no banner', () => {
    assert.equal(springboardBanner(rest + '</XCUIElementTypeApplication>'), undefined);
  });
  it('known banner pattern anywhere → banner', () => {
    const s = rest + `  <XCUIElementTypeOther type="XCUIElementTypeOther" name="NotificationShortLookView" visible="false" accessible="false" x="8" y="60" width="386" height="80"/>\n</XCUIElementTypeApplication>`;
    assert.match(springboardBanner(s) ?? '', /ShortLook/);
  });
  it('XCUIElementTypeBanner type → banner', () => {
    const s = rest + `  <XCUIElementTypeBanner type="XCUIElementTypeBanner" visible="true" accessible="false" x="8" y="60" width="386" height="80"/>\n</XCUIElementTypeApplication>`;
    assert.match(springboardBanner(s) ?? '', /Banner/);
  });
  it('unknown visible+accessible element in top band outside status bar → banner', () => {
    const s = rest + `  <XCUIElementTypeButton type="XCUIElementTypeButton" name="Slack, Rahul: hi" label="Slack" visible="true" accessible="true" x="8" y="60" width="386" height="80"/>\n</XCUIElementTypeApplication>`;
    assert.match(springboardBanner(s) ?? '', /y=60/);
  });
  it('visible element low on screen → not a banner', () => {
    const s = rest + `  <XCUIElementTypeButton type="XCUIElementTypeButton" name="x" visible="true" accessible="true" x="8" y="600" width="386" height="80"/>\n</XCUIElementTypeApplication>`;
    assert.equal(springboardBanner(s), undefined);
  });
});
