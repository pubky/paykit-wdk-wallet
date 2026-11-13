#!/usr/bin/env node
// A JSON-RPC proxy in front of the local Anvil fork of Arbitrum One, for
// Bitkit's USD₮ payment proofs (docs/BITKIT-USDT-FORK.md).
//
//   node scripts/arbitrum-fork-rpc.mjs                 http://127.0.0.1:18547 → http://127.0.0.1:18545
//   node scripts/arbitrum-fork-rpc.mjs --port 18547 --upstream http://127.0.0.1:18545
//
// Bitkit reads a `receiptLogIndex` on every log of an
// eth_getTransactionReceipt result: the log's position in the receipt, as a
// decimal string (bitkit-core src/modules/usdt/proof.rs, receipt_index).
// Bitkit's own RPC gateway adds that field and plain Anvil does not, so on a
// raw fork Bitkit can neither create nor verify a proof. This proxy adds it
// to each log of every eth_getTransactionReceipt result, single or batched.
// Every other call and result passes through unchanged.
//
// It listens on 127.0.0.1 only and forwards only to a node on this computer.
// It refuses requests that carry an Origin header (browsers send one), so a
// web page cannot drive the fork through it.
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

import { ARBITRUM_FORK_RPC, loopbackHttpUrl } from './lib/demo-wallets.mjs';

const USAGE = `Usage: node scripts/arbitrum-fork-rpc.mjs [--port <port, default 18547>] [--upstream <url, default ${ARBITRUM_FORK_RPC}>]`;
const LISTEN_HOST = '127.0.0.1';
const RECEIPT_METHOD = 'eth_getTransactionReceipt';
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
/** How long Anvil gets to answer (a fork may fetch state from Arbitrum One first). */
const UPSTREAM_TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      port: { type: 'string', default: '18547' },
      upstream: { type: 'string', default: ARBITRUM_FORK_RPC },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const port = Number(options.port);
if (!/^\d+$/.test(options.port) || port < 1 || port > 65535) fail(`--port must be a port number, not "${options.port}".`);
let upstream;
try {
  upstream = loopbackHttpUrl(options.upstream, '--upstream');
} catch (error) {
  fail(error.message);
}

/** A receipt response with receiptLogIndex (the log's position, as a decimal string) on each log. */
function withReceiptLogIndex(response) {
  const logs = response?.result?.logs;
  if (!Array.isArray(logs)) return response;
  const indexed = logs.map((log, position) => ({ ...log, receiptLogIndex: String(position) }));
  return { ...response, result: { ...response.result, logs: indexed } };
}

/**
 * The upstream response text with receiptLogIndex added to every receipt
 * result, or `responseText` itself when the request asks for no receipt.
 * Responses are matched to calls by id. An id that a batch also uses for
 * another method is left alone rather than guessed. Throws if either text
 * is not JSON.
 */
function addReceiptLogIndexes(requestText, responseText) {
  const calls = [JSON.parse(requestText)].flat();
  const isReceiptCall = (call) => call?.method === RECEIPT_METHOD;
  if (!calls.some(isReceiptCall)) return responseText;
  const idKey = (message) => JSON.stringify(message?.id);
  const receiptIds = new Set(calls.filter(isReceiptCall).map(idKey));
  for (const call of calls) if (!isReceiptCall(call)) receiptIds.delete(idKey(call));
  const patch = (response) => (receiptIds.has(idKey(response)) ? withReceiptLogIndex(response) : response);
  const response = JSON.parse(responseText);
  return JSON.stringify(Array.isArray(response) ? response.map(patch) : patch(response));
}

/**
 * The request body, or undefined as soon as it grows past MAX_REQUEST_BYTES:
 * reading then stops (the caller answers and closes the connection), so an
 * oversized body is never read to its end.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size <= MAX_REQUEST_BYTES) return chunks.push(chunk);
      request.off('data', onData);
      request.pause();
      resolve(undefined);
    };
    request.on('data', onData);
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function reply(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

async function handle(request, response) {
  if (request.method !== 'POST') return reply(response, 405, 'POST JSON-RPC only.\n');
  if (request.headers.origin !== undefined) return reply(response, 403, 'Browser requests are refused.\n');
  const requestText = await readBody(request);
  if (requestText === undefined) {
    response.writeHead(413, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
    // The rest of the body is never read: drop the connection once the answer is out.
    response.end('Request too large.\n', () => request.destroy());
    return;
  }

  let upstreamResponse;
  let responseText;
  try {
    upstreamResponse = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestText,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    responseText = await upstreamResponse.text();
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error(`${upstream} did not answer within ${UPSTREAM_TIMEOUT_MS / 1000} s.`);
      return reply(response, 504, `${upstream} did not answer in time.\n`);
    }
    console.error(`Could not reach ${upstream}: ${error.cause?.code ?? error.message}`);
    return reply(response, 502, `Could not reach ${upstream}.\n`);
  }
  let body = responseText;
  try {
    body = addReceiptLogIndexes(requestText, responseText);
  } catch {
    // Not JSON on one side: pass the upstream answer through as it is.
  }
  reply(response, upstreamResponse.status, body, upstreamResponse.headers.get('content-type') ?? 'application/json');
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`Request failed: ${error.message}`);
    if (!response.headersSent) reply(response, 500, 'Proxy error.\n');
    else response.destroy();
  });
});
server.on('error', (error) => fail(`Could not listen on ${LISTEN_HOST}:${port}: ${error.message}`));
server.listen(port, LISTEN_HOST, () => {
  console.log(`Forwarding http://${LISTEN_HOST}:${port} to ${upstream}, adding receiptLogIndex to receipt logs. Ctrl-C stops it.`);
});
