// Is an IP address inside a known datacenter / hosting / VPN network?
import { V4, V6 } from "./dc-ranges.mjs";

let v4, v6;
function load() {
  if (v4) return;
  const b4 = Buffer.from(V4, "base64");
  v4 = new Uint32Array(b4.buffer, b4.byteOffset, b4.byteLength / 4);
  const b6 = Buffer.from(V6, "base64");
  v6 = new BigUint64Array(b6.buffer.slice(b6.byteOffset, b6.byteOffset + b6.byteLength));
}

function search(arr, x) {
  let lo = 0, hi = arr.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (x < arr[mid * 2]) hi = mid - 1;
    else if (x > arr[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

function v4ToInt(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function v6High64(ip) {
  let s = ip.split("%")[0].toLowerCase();
  if (s.includes(".")) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(fill).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  let x = 0n;
  for (let i = 0; i < 4; i++) x = (x << 16n) + BigInt(parseInt(parts[i] || "0", 16));
  return x;
}

export function isDatacenter(ip) {
  if (!ip) return false;
  load();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  if (ip.includes(".")) {
    const n = v4ToInt(ip);
    return n !== null && search(v4, n);
  }
  const h = v6High64(ip);
  return h !== null && search(v6, h);
}
