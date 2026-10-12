import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBrand } from '../vite.config.js';

test('each Vercel project builds its own site', () => {
  assert.equal(pickBrand({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'ruckus-orbit-fe3b.vercel.app' }), 'ruckus');
  assert.equal(pickBrand({ VERCEL: '1', VERCEL_URL: 'ruckus-abc123-team.vercel.app' }), 'ruckus');
  assert.equal(pickBrand({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'lead-gen-seven-xi.vercel.app' }), 'vestas');
  assert.equal(pickBrand({}), 'vestas');
  assert.equal(pickBrand({ APP_BRAND: 'vestas', VERCEL_URL: 'ruckus-x.vercel.app' }), 'vestas');
});
