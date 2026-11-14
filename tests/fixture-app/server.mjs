// App de teste que imita um console Lightning (abas, componente com shadow DOM, toasts, validações) com BUGS PLANTADOS por query string.
// ?bug=alta|limite|erro|object|console|5xx  ?drift=1  ?odd=1  ?spin=1
import http from 'node:http';

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Service Console</title>
<style>[hidden]{display:none!important}.slds-notify{border:1px solid #c23934;padding:6px;margin:6px 0}.slds-spinner{width:20px;height:20px;border:3px solid #ccc}</style></head><body>
<h1>Service Console</h1>
<div role="tablist"><button role="tab" id="t-casos" aria-selected="true">Casos</button><button role="tab" id="t-clientes">Clientes</button></div>
<section id="casos"><p>Cliente: <b>Cliente Teste</b> — Segmento: Premium</p><button id="novo" type="button">Novo caso</button>
<qa-case-form hidden></qa-case-form><div id="resultado" role="status"></div><div id="toasts"></div><div id="banner"></div><button id="excluir" type="button">Excluir caso</button></section>
<section id="clientes" hidden><label for="doc">Documento</label><input id="doc"><button id="buscar" type="button">Buscar</button><table id="res" hidden><tr><td>Cliente Teste</td><td>•••.456.789-••</td><td>Cartão, Conta</td></tr></table></section>
<script>
const Q = new URLSearchParams(location.search); const bug = Q.get('bug');
let contador = 0;
customElements.define('qa-case-form', class extends HTMLElement {
  connectedCallback() {
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = '<label>Assunto<input id="assunto"></label><label>Descrição<textarea id="desc"></textarea></label><label>Prioridade<select id="prio"><option>Baixa</option><option>Média</option><option>Alta</option></select></label><button id="salvar" type="button">' + (Q.get('drift') ? 'Gravar' : 'Salvar') + '</button><div id="erro" role="alert"></div>';
    r.getElementById('salvar').addEventListener('click', async () => {
      const assunto = r.getElementById('assunto').value, desc = r.getElementById('desc').value, prio = r.getElementById('prio').value; const erro = r.getElementById('erro'); erro.textContent = '';
      if (!assunto.trim()) { erro.textContent = 'Informe o assunto'; return; }
      if (assunto.length > 255 && bug !== 'limite') { erro.textContent = 'Assunto muito longo (máx. 255)'; return; }
      if (prio === 'Alta' && !desc.trim() && bug !== 'alta') { erro.textContent = 'Descrição obrigatória para prioridade Alta'; return; }
      contador++; const num = String(contador).padStart(5, '0');
      if (bug === '5xx') await fetch('/api/salvar?bug=5xx').catch(() => {});
      document.getElementById('resultado').innerHTML = '<span>Número do caso: </span><b>' + num + '</b>' + (bug === 'object' ? '<p>Cliente: [object Object]</p>' : '');
      if (bug === 'erro') document.getElementById('toasts').innerHTML = '<div class="slds-notify" role="alert">An unexpected error occurred. Error ID: 4711</div>';
      if (bug === 'console') setTimeout(() => { throw new Error('Uncaught TypeError: x is undefined'); }, 10);
      if (Q.get('odd')) document.getElementById('banner').textContent = 'Atendimento marcado como VIP';
      if (Q.get('spin')) document.getElementById('toasts').innerHTML += '<div class="slds-spinner" role="progressbar"></div>';
    });
  }
});
document.getElementById('novo').onclick = () => { document.querySelector('qa-case-form').hidden = false; };
document.getElementById('t-clientes').onclick = () => { casos.hidden = true; clientes.hidden = false; };
document.getElementById('t-casos').onclick = () => { casos.hidden = false; clientes.hidden = true; };
document.getElementById('buscar').onclick = () => { document.getElementById('res').hidden = false; };
document.getElementById('excluir').onclick = () => { document.getElementById('resultado').textContent = 'Caso excluído'; };
</script></body></html>`;

export function startFixture(port = 0) {
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/api/salvar')) { res.writeHead(req.url.includes('bug=5xx') ? 500 : 200, { 'content-type': 'application/json' }); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML);
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })));
}
