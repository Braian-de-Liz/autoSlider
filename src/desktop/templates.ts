import type { RunEvent } from './run-store.ts'
import type { OrchestratorInfo } from '../agent/orchestrator.ts'

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function statusTemplate(event?: RunEvent): string {
  if (!event) return '<div id="run-status" class="status-card muted"><span class="status-dot"></span><div><strong>Nenhum run iniciado</strong><small>O próximo pedido aparecerá aqui.</small></div></div>'
  const error = event.errorCode ? `<div class="error-box"><strong>${escapeHtml(event.errorCode)}</strong><span>${escapeHtml(event.message)}</span></div>` : ''
  const artifact = event.artifactPath ? `<div class="artifact-actions"><a href="${escapeHtml(event.artifactPath)}" download>Baixar PNG</a><a href="${escapeHtml(event.artifactPath.replace('/png', '/svg'))}" download>Baixar SVG</a><img src="${escapeHtml(event.artifactPath)}" alt="Preview do gráfico gerado"></div>` : ''
  return `<div id="run-status" class="status-card state-${escapeHtml(event.state)}" data-state="${escapeHtml(event.state)}" data-seq="${event.seq}"><span class="status-dot"></span><div><strong>${escapeHtml(event.state)}</strong><small>${escapeHtml(event.message)}</small></div>${error}${artifact}<code>${escapeHtml(event.runId)}</code></div>`
}

const timeline = ['RECEBIDO', 'ROTEADO', 'SPEC_GERADA', 'VALIDADA', 'RENDERIZADA', 'ENTREGUE']

const KIND_OPTIONS: [string, string][] = [['chart', 'Gráfico (PNG/SVG)'], ['pptx', 'Apresentação (PPTX)'], ['docx', 'Documento (DOCX)'], ['xlsx', 'Planilha (XLSX)']]

const DEFAULT_INFO: OrchestratorInfo = { projectName: 'Meu projeto', localOnly: true, provider: 'não configurado', model: '-', remote: false, supportedKinds: [], datasets: [] }

function projectPanel(info: OrchestratorInfo): string {
  const privacy = info.localOnly ? '<span class="pill">localOnly</span>' : '<span class="pill pill-warn">remoto permitido</span>'
  const datasets = info.datasets.length
    ? info.datasets.map((dataset) => `<div class="project-row"><span>Dataset</span><span class="value" title="${escapeHtml(dataset.columns.join(', '))}">${escapeHtml(dataset.id)}</span></div>`).join('')
    : '<div class="project-row"><span>Dataset</span><span class="value muted">nenhum</span></div>'
  return `<section class="panel" id="projeto"><h2>Projeto atual</h2><div class="project-row"><span>Nome</span><span class="value">${escapeHtml(info.projectName)}</span></div><div class="project-row"><span>Privacidade</span>${privacy}</div><div class="project-row"><span>Provedor</span><span class="value">${escapeHtml(info.provider)} · ${escapeHtml(info.model)} ${info.remote ? '(remoto)' : '(local)'}</span></div>${datasets}</section>`
}

function kindSelect(info: OrchestratorInfo): string {
  const options = KIND_OPTIONS.map(([value, label]) => info.supportedKinds.includes(value)
    ? `<option value="${value}">${label}</option>`
    : `<option value="${value}" disabled>${label} — em breve</option>`).join('')
  return `<select id="kind" name="kind">${options}</select>`
}

export function pageTemplate(event?: RunEvent, info: OrchestratorInfo = DEFAULT_INFO): string {
  const initial = event?.state ?? ''
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gerador de Artefatos</title>
  <link rel="icon" type="image/png" href="/assets/logo.fav.png">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#0b1120; color:#e5e7eb; --line:#253149; --panel:#111a2e; --soft:#91a0ba; --blue:#5b8cff; --green:#38d39f; --red:#ff7182 }
    * { box-sizing:border-box } body { margin:0; min-width:960px; background:radial-gradient(circle at 75% -10%,#1d315b 0,transparent 34%),#0b1120 }
    .shell { display:grid; grid-template-columns:250px 1fr; min-height:100vh } aside { border-right:1px solid var(--line); padding:28px 18px; background:#0d1629 } .brand { display:flex; gap:10px; align-items:center; font-weight:750; letter-spacing:-.02em; margin-bottom:42px } .brand-mark { display:grid; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--blue); color:white } nav { display:grid; gap:7px } nav a { padding:11px 12px; border-radius:8px; color:var(--soft); text-decoration:none } nav a.active,nav a:hover { color:#fff; background:#1a2a4a } .side-foot { position:absolute; bottom:24px; color:#687893; font-size:12px }
    main { width:min(1120px,calc(100vw - 310px)); padding:42px 48px 70px } .eyebrow { color:var(--blue); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:750 } h1 { margin:8px 0 6px; font-size:30px; letter-spacing:-.04em } .lead { color:var(--soft); margin:0 0 30px } .grid { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr); gap:20px; align-items:start } .panel { background:rgba(17,26,46,.88); border:1px solid var(--line); border-radius:14px; padding:22px } .panel h2 { margin:0 0 18px; font-size:15px } label { display:block; color:var(--soft); font-size:12px; margin:15px 0 7px } textarea,select { width:100%; border:1px solid #31415f; border-radius:9px; background:#0c1425; color:#edf2ff; padding:12px; font:inherit; outline:none } textarea { min-height:140px; resize:vertical } textarea:focus,select:focus { border-color:var(--blue) } .actions { display:flex; justify-content:space-between; align-items:center; margin-top:18px } button { border:0; border-radius:8px; background:var(--blue); color:#fff; padding:11px 16px; font-weight:700; cursor:pointer } button:hover { filter:brightness(1.12) } .hint { color:#71809a; font-size:12px }
    .project-row { display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding:12px 0; font-size:13px } .project-row:last-child { border:0 } .value { color:#f4f7ff; font-weight:600 } .pill { color:var(--green); background:#10372f; border-radius:99px; padding:4px 8px; font-size:11px } .pill-warn { color:#f5c76b; background:#3a2e12 } .status-wrap { grid-column:1/-1 } .status-card { display:flex; gap:13px; align-items:center; min-height:72px; background:#0c1425; border:1px solid var(--line); border-radius:10px; padding:14px 16px } .status-card>div:not(.error-box) { display:grid; gap:4px; flex:1 } .status-card strong { font-size:13px; letter-spacing:.03em } .status-card small { color:var(--soft) } .status-dot { width:10px; height:10px; border-radius:50%; background:#73809a; flex:none } .state-ENTREGUE .status-dot { background:var(--green); box-shadow:0 0 12px var(--green) } .state-FALHOU .status-dot { background:var(--red) } code { color:#687893; font-size:10px } .artifact-actions { display:flex; align-items:center; gap:8px; margin-left:auto } .artifact-actions a { color:#9fc0ff; font-size:11px; text-decoration:none; border:1px solid #31415f; border-radius:6px; padding:5px 7px } .artifact-actions img { width:96px; height:56px; object-fit:contain; background:#0b1120; border-radius:5px; border:1px solid #31415f } .error-box { display:grid; gap:3px; border-left:2px solid var(--red); padding-left:10px; color:#ffb0b9; font-size:12px } .error-box span { color:#dca0aa } .muted { color:var(--soft) }
    .timeline { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-top:16px } .step { position:relative; padding-top:23px; color:#64748d; font-size:10px; text-align:center } .step:before { content:''; position:absolute; top:5px; left:50%; width:10px; height:10px; transform:translateX(-50%); border-radius:50%; background:#34425b; border:3px solid #111a2e } .step:after { content:''; position:absolute; top:9px; left:calc(50% + 8px); right:calc(-50% + 8px); height:2px; background:#26344e } .step:last-child:after { display:none } .step.done { color:#d7e2ff } .step.done:before { background:var(--blue) } .step.done:after { background:#4167b6 } .step.current:before { background:var(--green); box-shadow:0 0 10px var(--green) } @media(max-width:900px) { body{min-width:0}.shell{display:block}aside{display:none}main{width:100%;padding:26px}.grid{grid-template-columns:1fr} }
  </style>
</head>
<body>
  <div class="shell"><aside><div class="brand"><span class="brand-mark">✦</span><span>Gerador de Artefatos</span></div><nav><a class="active" href="#pedido">Novo pedido</a><a href="#execucao">Execução atual</a><a href="#projeto">Projeto</a></nav><div class="side-foot">local-first · v0.4</div></aside>
  <main><div class="eyebrow">Workspace local</div><h1>O que você quer criar?</h1><p class="lead">Descreva o artefato. A spec será gerada, validada e renderizada sem sair deste projeto.</p>
    <div class="grid"><section class="panel" id="pedido"><h2>Novo pedido</h2><form id="request-form" method="post" action="/api/runs"><label for="prompt">Pedido</label><textarea id="prompt" name="prompt" placeholder="Ex.: crie uma apresentação com a evolução das vendas por região..." required>Crie um gráfico de vendas por categoria.</textarea><label for="kind">Formato de saída</label>${kindSelect(info)}<div class="actions"><span class="hint">O modelo recebe só o esquema e até 5 linhas de amostra.</span><button type="submit">Gerar artefato →</button></div></form></section>
      ${projectPanel(info)}
      <section class="panel status-wrap" id="execucao"><h2>Execução</h2>${statusTemplate(event)}<div class="timeline" aria-label="Timeline do run">${timeline.map((step) => `<div class="step${step === initial ? ' current' : initial && timeline.indexOf(step) < timeline.indexOf(initial) ? ' done' : ''}" data-step="${step}">${step}</div>`).join('')}</div></section>
    </div>
  </main></div>
  <script>
    const timeline = ${JSON.stringify(timeline)};
    let lastSeq = 0;
    function applyStatus(html) {
      const target = document.querySelector('#run-status');
      const wrapper = document.createElement('div'); wrapper.innerHTML = html;
      const next = wrapper.firstElementChild;
      if (!target || !next) return;
      const seq = Number(next.dataset.seq || 0);
      if (seq < lastSeq) return;
      lastSeq = seq;
      target.replaceWith(next);
      const current = timeline.indexOf(next.dataset.state || '');
      document.querySelectorAll('.step').forEach((step) => { const i = timeline.indexOf(step.dataset.step); step.classList.toggle('done', current >= 0 && i < current); step.classList.toggle('current', i === current); });
    }
    const form = document.getElementById('request-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const response = await fetch('/api/runs', { method: 'POST', body: new URLSearchParams(new FormData(form)) });
        applyStatus(await response.text());
      } finally { button.disabled = false; }
    });
    const source = new EventSource('/events');
    source.addEventListener('run', (event) => applyStatus(event.data));
  </script>
</body></html>`
}
