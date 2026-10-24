import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as h3 from 'h3';
import { withQuery, withoutTrailingSlash } from 'ufo';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, studioPackageRoot } from '../support/native';

interface SyntheticConfiguration {
  repository: { provider: string; private: boolean };
  auth: { github: { clientId?: string; clientSecret?: string } };
}

const syntheticSecret = 'synthetic-secret-for-an-offline-test';
const syntheticProviderError = 'synthetic-provider-diagnostic';
const authenticationPath = '/__nuxt_studio/auth/github';
const handlerSource = await readFile(`${studioPackageRoot}/dist/module/runtime/server/routes/auth/github.get.js`, 'utf8');
const utilitySource = await readFile(`${studioPackageRoot}/dist/module/runtime/server/utils/auth.js`, 'utf8');
const configurationModule = await import(pathToFileURL(`${studioPackageRoot}/dist/module/runtime/server/utils/object.js`).href) as {
  mergeConfig: (configuration: Record<string, unknown>, defaults: Record<string, unknown>) => Record<string, unknown>;
};

/** Evaluate the real provider handler with a synthetic config and network boundaries that cannot execute. */
function createProviderHandler(configuration: SyntheticConfiguration): h3.EventHandler {
  const errorWrapper = expectedFixed
    ? declaration(utilitySource, 'export function defineStudioAuthHandler(', 'export async function requireStudioAuth(').replace('export function ', 'function ')
    : '';
  const executable = handlerSource.replace(/^import [^\n]*\n/gmu, '').replace('export default ', 'const nativeHandler = ');
  const unavailable = (): never => { throw new Error('This reproduction must not contact OAuth or create a session.'); };
  return runInNewContext(`${errorWrapper}\n${executable}\nnativeHandler;`, {
    ...h3,
    URL,
    useRuntimeConfig: () => ({ studio: configuration }),
    mergeConfig: configurationModule.mergeConfig,
    withQuery,
    withoutTrailingSlash,
    generateOAuthState: unavailable,
    requestAccessToken: unavailable,
    validateOAuthState: unavailable,
    setInternalStudioUserSession: unavailable,
    $fetch: unavailable,
  }, { timeout: 1000 }) as h3.EventHandler;
}

/** Serialize a real H3 response without opening a port or making a network request. */
async function requestProvider(configuration: SyntheticConfiguration, query = ''): Promise<Response> {
  const application = h3.createApp({ debug: false });
  application.use(createProviderHandler(configuration));
  return await h3.toWebHandler(application)(new Request(`https://example.test${authenticationPath}${query}`));
}

// Missing client ID stops execution before any provider/network/session operation.
const missingConfiguration: SyntheticConfiguration = {
  repository: { provider: 'github', private: false },
  auth: { github: { clientSecret: syntheticSecret } },
};
const missingResponse = await requestProvider(missingConfiguration);
const missingBody = await missingResponse.text();
assert.equal(missingResponse.status, 500);
assert.equal(missingBody.includes(syntheticSecret), !expectedFixed, 'The public error must not reflect even a synthetic configured secret.');

// An upstream callback diagnostic must not be echoed into a public error response.
const declinedResponse = await requestProvider(missingConfiguration, `?error=${syntheticProviderError}`);
const declinedBody = await declinedResponse.text();
assert.equal(declinedResponse.status, 401);
assert.equal(declinedBody.includes(syntheticProviderError), !expectedFixed);

if (expectedFixed) {
  for (const response of [missingResponse, declinedResponse]) {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
  }
  const publicFailure = JSON.parse(missingBody) as Record<string, unknown>;
  assert.deepEqual(Object.keys(publicFailure).sort(), ['message', 'statusCode']);
}

process.stdout.write(`${modeLabel}: real GitHub handler and H3 responses ${expectedFixed ? 'sanitize' : 'reproduce reflection of'} synthetic OAuth error details.\n`);
