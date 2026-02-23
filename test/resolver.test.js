const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// ---------------------------------------------------------------------------
// Bootstrap: load index.html into jsdom so the inline <script> executes
// ---------------------------------------------------------------------------
let window;

before(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost',
    pretendToBeVisual: true,
  });

  window = dom.window;

  // Provide a mock fetch so resolveUrl doesn't crash when it falls through
  // past the known-stations guard (for non-known-domain tests).
  if (typeof window.fetch !== 'function') {
    window.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
  }
});

// ---------------------------------------------------------------------------
// Helper: extract KNOWN_STATIONS keys from the script source, since `const`
// declarations are block-scoped and NOT on window.
// ---------------------------------------------------------------------------
function getKnownStationKeys() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const match = html.match(/const KNOWN_STATIONS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(match, 'KNOWN_STATIONS block found in HTML');
  // Extract all quoted keys like 'nts.live':
  const keys = [];
  const keyRegex = /'([^']+)'\s*:/g;
  let m;
  while ((m = keyRegex.exec(match[1])) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Known Stations - resolveUrl', () => {

  it('resolves nts.live with 2 channels', async () => {
    const result = await window.resolveUrl('nts.live');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 2);
    assert.ok(result.stations[0].title.includes('Channel 1'));
    assert.ok(result.stations[1].title.includes('Channel 2'));
    assert.ok(result.stations[0].streamUrl.includes('ntslive.net/stream'));
  });

  it('resolves rinse.fm with correct URL', async () => {
    const result = await window.resolveUrl('rinse.fm');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
    assert.ok(result.stations[0].streamUrl.includes('admin.stream.rinse.fm'));
  });

  it('strips www. prefix — www.nts.live matches nts.live', async () => {
    const result = await window.resolveUrl('www.nts.live');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 2);
  });

  it('matches with full URL including path', async () => {
    const result = await window.resolveUrl('https://nts.live/shows/some-show');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 2);
  });

  it('is case-insensitive — NTS.LIVE matches', async () => {
    const result = await window.resolveUrl('NTS.LIVE');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 2);
  });

  it('resolves radiofrance.fr with all Radio France stations', async () => {
    const result = await window.resolveUrl('radiofrance.fr');
    assert.equal(result.kind, 'known_station');
    assert.ok(result.stations.length >= 7, `Expected ≥7 stations, got ${result.stations.length}`);
    const titles = result.stations.map(s => s.title);
    assert.ok(titles.some(t => t.includes('FIP')));
    assert.ok(titles.some(t => t.includes('France Inter')));
    assert.ok(titles.some(t => t.includes('France Culture')));
    assert.ok(titles.some(t => t.includes('France Musique')));
  });

  it('resolves fip.fr with 5 FIP channels', async () => {
    const result = await window.resolveUrl('fip.fr');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 5);
    for (const s of result.stations) {
      assert.ok(s.streamUrl.includes('icecast.radiofrance.fr'));
      assert.ok(s.streamUrl.includes('?id=radiofrance'));
    }
  });

  it('resolves franceinter.fr as individual station', async () => {
    const result = await window.resolveUrl('franceinter.fr');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
    assert.ok(result.stations[0].title.includes('France Inter'));
  });

  it('resolves acikradyo.com.tr (Apaçık Radyo)', async () => {
    const result = await window.resolveUrl('acikradyo.com.tr');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
    assert.ok(result.stations[0].streamUrl.includes('stream.34bit.net'));
  });

  it('resolves apacikradyo.com.tr as alias', async () => {
    const result = await window.resolveUrl('apacikradyo.com.tr');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
  });

  it('resolves radioeksen.com (Radyo Eksen)', async () => {
    const result = await window.resolveUrl('radioeksen.com');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
    assert.ok(result.stations[0].streamUrl.includes('radyotvonline.com'));
  });

  it('resolves futuregeneration.net (FG 93.8)', async () => {
    const result = await window.resolveUrl('futuregeneration.net');
    assert.equal(result.kind, 'known_station');
    assert.equal(result.stations.length, 1);
  });

  it('resolves radiofg.com with sub-channels', async () => {
    const result = await window.resolveUrl('radiofg.com');
    assert.equal(result.kind, 'known_station');
    assert.ok(result.stations.length >= 5, `Expected ≥5 stations, got ${result.stations.length}`);
    const titles = result.stations.map(s => s.title);
    assert.ok(titles.some(t => t.includes('Radio FG')));
    assert.ok(titles.some(t => t.includes('Lounge')));
  });

  it('resolves all KNOWN_STATIONS keys', async () => {
    const keys = getKnownStationKeys();
    assert.ok(keys.length >= 14, `Expected ≥14 keys, got ${keys.length}`);
    for (const key of keys) {
      const result = await window.resolveUrl(key);
      assert.equal(result.kind, 'known_station', `Key "${key}" should resolve as known_station`);
      assert.ok(result.stations.length > 0, `Key "${key}" should have at least one station`);
    }
  });

  it('every station entry has title and streamUrl strings', async () => {
    const keys = getKnownStationKeys();
    for (const key of keys) {
      const result = await window.resolveUrl(key);
      for (const station of result.stations) {
        assert.equal(typeof station.title, 'string', `Station in "${key}" missing title`);
        assert.ok(station.title.length > 0, `Station in "${key}" has empty title`);
        assert.equal(typeof station.streamUrl, 'string', `Station in "${key}" missing streamUrl`);
        assert.ok(station.streamUrl.startsWith('http'), `Station in "${key}" has invalid streamUrl: ${station.streamUrl}`);
      }
    }
  });

  it('stream server hostnames do NOT trigger known_station', async () => {
    // This URL is a direct stream, not a station website — should NOT match known_station
    const result = await window.resolveUrl('https://stream-relay-geo.ntslive.net/stream');
    assert.notEqual(result.kind, 'known_station');
  });

  it('returns copies, not references to the canonical table', async () => {
    const r1 = await window.resolveUrl('nts.live');
    r1.stations[0].title = 'MUTATED';
    const r2 = await window.resolveUrl('nts.live');
    assert.notEqual(r2.stations[0].title, 'MUTATED');
  });
});
