import handler from '../../api/orders.js';
import {runApi} from '../../cloudflare/bridge.mjs';
export function onRequest({request, env}) { return runApi(handler, request, env); }
