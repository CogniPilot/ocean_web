#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
work=build/trystero-refresh
npm install --prefix "$work" --no-save --no-package-lock \
  esbuild@0.27.4 @trystero-p2p/nostr@0.25.3 @noble/secp256k1@3.1.0
node --input-type=module - "$work" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const work=process.argv[2];
function patch(file,edits){
  const path=work+'/node_modules/@trystero-p2p/'+file;
  let source=readFileSync(path,'utf8');
  for(const [before,after] of edits){
    if(source.includes(after))continue;
    if(source.split(before).length!==2)throw Error('Unexpected vendored source in '+file);
    source=source.replace(before,after);
  }
  writeFileSync(path,source);
}
// Ephemeral signaling is timestamped by the sender. Allow skew when
// subscribing or a fast local clock will exclude a live peer's SDP/candidates.
patch('nostr/dist/index.mjs',[
  ['const since = now();','const since = now() - 120;'],
  ['since: now(),','since: now() - 120,'],
  ['subIds: [],','client,\n\t\tsubIds: [],'],
  ['const resubscribeOnReconnect = (client) => {',
   'export function refreshRelaySubscriptions() {\n\tfor (const {client} of Object.values(batchers)) {\n\t\tif (client.socket.readyState === WebSocket.OPEN) flushBatch(client);\n\t}\n}\nconst resubscribeOnReconnect = (client) => {']
]);
// Expose the existing announcement restart without touching live connections.
// Ignore completions from a prior announcement cycle when refreshing it.
patch('core/dist/strategy.mjs',[
  ['const announceTimeouts = [];','const announceTimeouts = [];\n\t\tlet announceGeneration = 0;'],
  ['const queueAnnounce = async (relay, i) => {','const queueAnnounce = async (relay, i) => {\n\t\t\t\tconst generation = announceGeneration;'],
  ['if (didLeaveRoom || isPassive && !ctx.isActive) return;','if (generation !== announceGeneration || didLeaveRoom || isPassive && !ctx.isActive) return;'],
  ['ctx.requeueAnnounce = () => {','ctx.requeueAnnounce = () => {\n\t\t\t\tannounceGeneration++;'],
  ['}, roomOptions);','}, roomOptions);\n\t\tjoinedRoom.reannounce = () => ctx.requeueAnnounce?.();']
]);
writeFileSync(work+'/entry.mjs',"export {joinRoom,selfId,refreshRelaySubscriptions} from '@trystero-p2p/nostr';\n");
JS
"$work/node_modules/.bin/esbuild" "$work/entry.mjs" --bundle --minify --format=esm --outfile=viewer/vendor/trystero.mjs
