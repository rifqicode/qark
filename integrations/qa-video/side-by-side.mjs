#!/usr/bin/env node
// Optional: combine a before and an after video into one labelled side-by-side file (requires ffmpeg).
//   node side-by-side.mjs --before Q-01-before.webm --after Q-01-after.webm --out Q-01-compare.webm
// Falls back to an unlabelled layout when ffmpeg's drawtext is unavailable. Exit 3 if ffmpeg is missing.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from './lib.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const [before, after, out] = ['before', 'after', 'out'].map(key => (typeof flags[key] === 'string' ? resolve(flags[key]) : null));
if (!before || !after || !out) {
  console.error('Usage: side-by-side.mjs --before <video> --after <video> --out <video>');
  process.exit(2);
}
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('ffmpeg not found. Side-by-side is optional: report the two videos separately.');
  process.exit(3);
}
mkdirSync(dirname(out), { recursive: true });
const scale = '[0:v]scale=-2:720,setsar=1,fps=25';
const scaleB = '[1:v]scale=-2:720,setsar=1,fps=25';
const label = text => ',pad=iw:ih+48:0:48:black,drawtext=text=' + text + ':x=12:y=8:fontsize=30:fontcolor=white';
const build = labelled => [
  '-y', '-i', before, '-i', after, '-filter_complex',
  scale + (labelled ? label('BEFORE') : '') + '[a];' + scaleB + (labelled ? label('AFTER') : '') + '[b];[a][b]hstack=inputs=2[v]',
  '-map', '[v]', '-an', out
];
let result = spawnSync('ffmpeg', build(true), { encoding: 'utf8' });
if (result.status !== 0) {
  console.error('Labelled render failed; retrying without labels.');
  result = spawnSync('ffmpeg', build(false), { encoding: 'utf8' });
}
if (result.status !== 0) {
  console.error(result.stderr.split('\n').slice(-8).join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({ out }));
