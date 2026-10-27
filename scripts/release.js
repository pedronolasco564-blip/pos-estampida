// Publica una versión nueva para que la caja se actualice sola.
// Uso: sube "version" en package.json y ejecuta `npm run release`.
//
// Pasos: crea el release como borrador en el repo público de actualizaciones,
// sube instalador + latest.yml con electron-builder y al final lo publica.
// (Si electron-builder crea el release él mismo, sube los archivos en paralelo
// y uno de los intentos falla; por eso el release se crea antes.)
const { execSync, spawnSync } = require('child_process');
const pkg = require('../package.json');

const { owner, repo } = pkg.build.publish[0];
const tag = `v${pkg.version}`;
const API = `https://api.github.com/repos/${owner}/${repo}`;

function getToken() {
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
    // El acceso a GitHub que ya guarda git en esta PC
    const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
    const m = out.match(/^password=(.+)$/m);
    if (!m) throw new Error('No hay acceso a GitHub guardado. Define GH_TOKEN.');
    return m[1].trim();
}

async function gh(token, method, path, body) {
    const res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, data };
}

(async () => {
    const token = getToken();

    const existing = await gh(token, 'GET', `/releases/tags/${tag}`);
    if (existing.status === 200 && !existing.data.draft) {
        throw new Error(`${tag} ya está publicado. Sube "version" en package.json antes de publicar.`);
    }
    let release = existing.status === 200 ? existing.data : null;
    if (!release) {
        const created = await gh(token, 'POST', '/releases', { tag_name: tag, target_commitish: 'main', name: pkg.version, draft: true });
        if (created.status !== 201) throw new Error(`No se pudo crear el release: ${JSON.stringify(created.data)}`);
        release = created.data;
    }
    console.log(`Release ${tag} listo como borrador. Construyendo y subiendo...`);

    const env = { ...process.env, GH_TOKEN: token };
    delete env.ELECTRON_RUN_AS_NODE;
    const build = spawnSync('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always'], { stdio: 'inherit', env, shell: true });
    if (build.status !== 0) throw new Error('electron-builder falló; el release quedó como borrador.');

    const check = await gh(token, 'GET', `/releases/${release.id}`);
    const names = (check.data.assets || []).map(a => a.name);
    if (!names.includes('latest.yml') || !names.some(n => n.endsWith('.exe'))) {
        throw new Error(`Faltan archivos en el release (${names.join(', ')}); quedó como borrador.`);
    }
    const pub = await gh(token, 'PATCH', `/releases/${release.id}`, { draft: false, make_latest: 'true' });
    if (pub.status !== 200) throw new Error(`No se pudo publicar: ${JSON.stringify(pub.data)}`);
    console.log(`✅ Publicado ${tag}: ${names.join(', ')}`);
    console.log('La caja lo descargará sola y lo instalará al siguiente arranque.');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
