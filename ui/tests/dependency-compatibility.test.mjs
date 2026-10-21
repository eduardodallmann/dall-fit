import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const capacitorRequire = createRequire(
  realpathSync(
    fileURLToPath(
      new URL('../node_modules/@capacitor/cli/package.json', import.meta.url),
    ),
  ),
);
const xcodePath = capacitorRequire.resolve('xcode');
const xcodeRequire = createRequire(xcodePath);

test('the Capacitor Xcode dependency loads without require(esm)', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--no-experimental-require-module',
      '--eval',
      `require(${JSON.stringify(xcodePath)})`,
    ],
    { encoding: 'utf8', env: {}, timeout: 10_000 },
  );

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('the UUID override preserves Xcode project generation and serialization', () => {
  const xcode = capacitorRequire('xcode');
  const parser = xcodeRequire('./lib/parser/pbxproj');
  const project = xcode.project('dependency-smoke.pbxproj');
  project.hash = {
    project: {
      archiveVersion: 1,
      classes: {},
      objectVersion: 56,
      objects: { PBXGroup: {}, PBXFileReference: {} },
      rootObject: 'ABCDEF0123456789ABCDEF01',
    },
  };

  const first = project.addPbxGroup([], 'FirstGroup');
  const second = project.addPbxGroup([], 'SecondGroup');
  assert.match(first.uuid, /^[A-F0-9]{24}$/);
  assert.match(second.uuid, /^[A-F0-9]{24}$/);
  assert.notEqual(first.uuid, second.uuid);

  const parsed = parser.parse(project.writeSync());
  assert.equal(parsed.project.objects.PBXGroup[first.uuid].name, 'FirstGroup');
  assert.equal(
    parsed.project.objects.PBXGroup[second.uuid].name,
    'SecondGroup',
  );
});
