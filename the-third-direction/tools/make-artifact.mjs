// Turns dist-artifact (npm run build:artifact) into one HTML fragment, dist-artifact/artifact.html, for the Artifact tool:
// the title, the game's CSS and its script inline, no <html>/<head>/<body> (the platform adds those).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-artifact');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const read = (ref) => fs.readFileSync(path.join(dist, ref.replace(/^\.\//, '')), 'utf8');

const js = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => read(m[1]));
const css = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => read(m[1]));
if (js.length !== 1) throw new Error(`expected one script, found ${js.length}`);
// keep the script from closing its own tag, and from starting an HTML comment
const safeJs = js[0].replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeCss = css.join('\n').replace(/<\/style/gi, '<\\/style');

const out = `<title>The Third Direction</title>
<style>
/* One dark look on purpose: the game draws its own world, so the page only supplies the ground it stands on. */
:root { --ink: #05060c; --bone: #e8e2d0; --glow: #f2d36b; color-scheme: dark; }
body { background: var(--ink); color: var(--bone); }
${safeCss}
</style>
<div id="app"></div>
<script type="module">
${safeJs}
</script>
`;
fs.writeFileSync(path.join(dist, 'artifact.html'), out);
console.log(`artifact.html: ${(out.length / 1024).toFixed(0)} KB (script ${(safeJs.length / 1024).toFixed(0)} KB, css ${(safeCss.length / 1024).toFixed(0)} KB)`);
