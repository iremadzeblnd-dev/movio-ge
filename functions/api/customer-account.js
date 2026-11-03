import handler from '../../api/customer-account.js';
import {runApi} from '../../cloudflare/bridge.mjs';
export function onRequest({request, env}) { return runApi(handler, request, env, 4096); }
