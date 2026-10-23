import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overlayFontScale} from '../shared/overlay-font.ts';
test('overlay font bounds adapt to minimum, standard and large windows',()=>{
 assert.equal(overlayFontScale(180,280,440),94);
 assert.equal(overlayFontScale(180,360,660),140);
 assert.equal(overlayFontScale(180,560,900),180);
 assert.equal(overlayFontScale(85,560,900),85);
 assert.equal(overlayFontScale(999,560,900),180);
 assert.equal(overlayFontScale(NaN,560,900),100);
});
