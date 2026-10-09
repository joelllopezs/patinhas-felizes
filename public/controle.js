'use strict';
const T = location.pathname.split('/').filter(Boolean)[1] || '';
const API = '/api/controle/' + encodeURIComponent(T) + '/';
const $ = (i) => document.getElementById(i);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = (v) => new Date(v + 'T00:00');
const ISO = (d) => d.toLocaleDateString('sv-SE');
const add = (v, n) => { const d = P(v); d.setDate(d.getDate() + n); return ISO(d); };
const diff = (a, b) => Math.round((P(b) - P(a)) / 864e5);
const br = (v) => v.slice(8) + '/' + v.slice(5, 7);
const R = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const hh = (h) => (h ? String(h).slice(0, 5).replace(':00', 'h') : '');
const SV = {
  hospedagem_cao: { n: 'Hospedagem (cão)', g: 'h', e: '🐶' },
  hospedagem_gato: { n: 'Hospedagem (gato)', g: 'h', e: '🐱' },
  creche: { n: 'Creche', g: 'c', e: '🎾' },
  domiciliar: { n: 'Visita em casa', g: 'v', e: '🚪' },
};
const G = { h: '🏠 Hospedagem', c: '🎾 Creche', v: '🚪 Visita em casa' };
const ST = {
  aguardando_validacao: ['Aguardando validação', 't-w'],
  confirmado: ['Confirmado', 't-ok'],
  cancelado: ['Cancelado', 't-r'],
  expirado: ['Expirado', 't-b'],
};
const NAV = [['agenda', '📅', 'Reservas'], ['clientes', '🐾', 'Clientes'], ['estadias', '🏠', 'Estadias'], ['relatorios', '📊', 'Relatórios'], ['valores', '💲', 'Valores']];
const PAGS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']];
const PAGN = Object.fromEntries(PAGS);

let D = null, tab = 'agenda', sel = '', flt = 'all', pfl = 'all', busy = false, tt;

async function api(rota, corpo) {
  const r = await fetch(API + rota, corpo === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Erro ' + r.status);
  return j;
}
const toast = (m) => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(tt); tt = setTimeout(() => { t.style.display = 'none'; }, 2600); };
async function run(fn, okMsg) {
  if (busy) return;
  busy = true;
  try { await fn(); await load(); if (okMsg) toast(okMsg); }
  catch (e) { toast('⚠️ ' + e.message); }
  finally { busy = false; }
}

const ativo = (r) => r.status === 'aguardando_validacao' || r.status === 'confirmado';
const grupo = (r) => SV[r.servico].g;
const has = (r, d) => (r.datas.length ? r.datas.includes(d) : r.servico === 'hospedagem_cao' || r.servico === 'hospedagem_gato' ? r.entrada <= d && d < r.saida : r.entrada <= d && d <= r.saida);
const dias = (r) => (r.datas.length ? r.datas.length : Math.max(1, diff(r.entrada, r.saida)));
const caes = (d) => D.reservas.filter((r) => ativo(r) && (r.servico === 'hospedagem_cao' || r.servico === 'creche') && has(r, d));
const nCaes = (d) => caes(d).reduce((t, r) => t + r.qtd, 0);
const gatos = (d) => D.reservas.filter((r) => ativo(r) && r.servico === 'hospedagem_gato' && has(r, d)).length;
const visitas = (d) => D.reservas.filter((r) => ativo(r) && r.servico === 'domiciliar' && has(r, d)).length;
const pz = (s, d) => D.pausas.find((p) => (!p.servico || p.servico === s) && d >= p.inicio && d <= p.fim);
const allP = (d) => Object.keys(SV).every((s) => pz(s, d));
const sum = (a) => a.reduce((t, r) => t + r.total, 0);
const pets = (r) => esc(r.pets.join(', ') || '—');
const emo = (r) => SV[r.servico].e;
const zap = (t) => 'https://wa.me/' + (String(t).replace(/\D/g, '').length <= 11 ? '55' : '') + String(t).replace(/\D/g, '');
const comp = (r) => (r.comprovante ? `<a class="btn g s" target="_blank" rel="noopener" href="${esc(r.comprovante.url)}">📎 Comprovante</a>` : '');
const head = (t, s, b) => `<div class="top"><div><h1>${t}</h1><div class="sub">${s}</div></div>${b || ''}</div>`;
const newBtn = '<button class="btn" data-a="novo">+ Novo agendamento</button>';

async function load() {
  try { D = await api('dados'); if (!sel) sel = D.hoje; render(); }
  catch (e) { $('v').innerHTML = `<div class="err">Não foi possível carregar: ${esc(e.message)}</div><button class="btn" data-a="reload">Tentar de novo</button>`; }
}
function render() {
  $('nav').innerHTML = NAV.map(([k, e, t]) => `<button class="${tab === k ? 'on' : ''}" data-a="go" data-v="${k}">${e} ${t}</button>`).join('');
  $('v').innerHTML = { agenda: vAgenda, clientes: vClientes, estadias: vEstadias, relatorios: vRel, valores: vValores }[tab]();
}

function vAgenda() {
  const H = D.hoje, lb = sel === H ? 'hoje' : br(sel);
  const cur = D.pausas.find((p) => !p.servico && H >= p.inicio && H <= p.fim);
  const nx = D.pausas.filter((p) => p.inicio > H)[0];
  const ban = `<div class="banner ${cur ? 'p' : ''}"><div style="font-size:30px">${cur ? '⏸' : '✅'}</div><div class="grow"><b>${cur ? 'Agendamentos pausados' : 'Agendamentos abertos'}</b><span class="sm" style="color:inherit">${cur ? 'Até ' + br(cur.fim) + (cur.motivo ? ' · ' + esc(cur.motivo) : '') : nx ? 'Próxima pausa: ' + br(nx.inicio) + ' a ' + br(nx.fim) + (nx.motivo ? ' · ' + esc(nx.motivo) : '') : 'Clientes podem reservar normalmente'}</span></div><button class="btn" data-a="pausar">⏸ Pausar por período</button></div>`;
  const pend = D.reservas.filter((r) => r.status === 'aguardando_validacao');
  const pc = pend.length ? `<div class="card"><h3>Aguardando validação (${pend.length})</h3>${pend.map((r) => `<div class="row"><div class="av">${emo(r)}</div><div class="grow"><b>${pets(r)}</b> <span class="tag t-w">Comprovante enviado</span><div class="sm">${SV[r.servico].n} · ${esc(r.cliente)} · ${br(r.entrada)}${r.saida !== r.entrada ? ' → ' + br(r.saida) : ''} · ${R(r.total)}</div></div>${comp(r)}<button class="btn s" data-a="conf" data-v="${r.id}">Confirmar</button><button class="btn g s" data-a="canc" data-v="${r.id}">Recusar</button></div>`).join('')}</div>` : '';
  const strip = [...Array(21)].map((_, k) => { const d = add(H, k), t = caes(d).length + gatos(d) + visitas(d); return `<button class="dy ${d === sel ? 'sel' : ''} ${allP(d) ? 'ps' : ''}" data-a="dia" data-v="${d}"><small>${P(d).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}</small><b>${+d.slice(8)}</b><em>${allP(d) ? '⏸' : t + ' 🐾'}</em></button>`; }).join('');
  const L = D.limiteVagas, o = nCaes(sel), l = Math.max(0, L - o), p = L ? o / L : 1;
  const hc = caes(sel).filter((r) => r.servico === 'hospedagem_cao').reduce((t, r) => t + r.qtd, 0);
  const pzC = pz('hospedagem_cao', sel) && pz('creche', sel);
  const tag = (z, lot) => (z ? '<span class="tag t-b">Pausada</span>' : lot ? '<span class="tag t-w">Lotada</span>' : '<span class="tag t-ok">Aberta</span>');
  const gg = gatos(sel), vv = visitas(sel);
  const mods = `<div class="mod"><div class="top"><b>🐕 Cães · hospedagem + creche</b>${tag(pzC, l === 0)}</div><div style="margin-top:8px"><span class="big">${l}</span> <span class="sm">vagas livres de ${L}</span></div><div class="bar"><u class="${p >= 1 ? 'z' : p > .7 ? 'f' : ''}" style="width:${Math.min(100, p * 100)}%"></u></div><div class="sm">${hc} hospedagem · ${o - hc} creche</div><div class="step"><span class="sm">Vagas por dia</span><div><button data-a="cap" data-v="-1" aria-label="menos">−</button> <b>${L}</b> <button data-a="cap" data-v="1" aria-label="mais">+</button></div></div></div>
  <div class="mod"><div class="top"><b>🐱 Hospedagem de gatos</b>${tag(pz('hospedagem_gato', sel), gg >= D.limiteGatos)}</div><div style="margin-top:8px"><span class="big">${Math.max(0, D.limiteGatos - gg)}</span> <span class="sm">vaga livre de ${D.limiteGatos}</span></div><div class="bar"><u class="${gg >= D.limiteGatos ? 'z' : ''}" style="width:${Math.min(100, gg / D.limiteGatos * 100)}%"></u></div><div class="sm">1 cliente de gatos por dia (regra do site)</div></div>
  <div class="mod"><div class="top"><b>🚪 Visita em casa</b>${tag(pz('domiciliar', sel), false)}</div><div style="margin-top:8px"><span class="big">${vv}</span> <span class="sm">agendada${vv === 1 ? '' : 's'}</span></div><div class="sm" style="margin-top:14px">Sem limite fixo: rota e horário são combinados.</div></div>`;
  const dayList = D.reservas.filter((r) => ativo(r) && (has(r, sel) || (grupo(r) === 'h' && r.saida === sel))).filter((r) => flt === 'all' || grupo(r) === flt);
  const rows = dayList.length ? dayList.map((r) => {
    const h = grupo(r) === 'h';
    const st = r.status === 'aguardando_validacao' ? ['Aguardando', 't-w'] : h && r.entrada === sel ? ['Chegando', 't-w'] : h && r.saida === sel ? ['Saindo', 't-b'] : h ? ['Hospedado', 't-ok'] : ['Confirmado', 't-ok'];
    return `<div class="row"><div class="av">${emo(r)}</div><div class="grow"><b>${pets(r)}</b> <span class="tag ${st[1]}">${st[0]}</span><div class="sm">${SV[r.servico].n} · ${esc(r.cliente)}${h ? ' · ' + br(r.entrada) + ' → ' + br(r.saida) : ''}</div></div>${comp(r)}<button class="btn g s" data-a="edit" data-v="${r.id}">Editar</button><button class="btn g s" data-a="canc" data-v="${r.id}">Cancelar</button></div>`;
  }).join('') : '<div class="sm" style="padding:14px 0">Nenhum agendamento neste dia.</div>';
  const pl = D.pausas.length ? D.pausas.map((x) => `<div class="row"><div class="av">⏸</div><div class="grow"><b>${br(x.inicio)} a ${br(x.fim)}</b><div class="sm">${x.servico ? SV[x.servico].n : 'Todas as modalidades'}${x.motivo ? ' · ' + esc(x.motivo) : ''}</div></div><button class="btn g s" data-a="retomar" data-v="${x.id}">Retomar</button></div>`).join('') : '<div class="sm">Nenhuma pausa programada.</div>';
  return head('Reservas', 'Agenda, vagas e pausas · ' + P(H).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }), newBtn) + ban + pc +
    `<div class="card"><div class="strip">${strip}</div></div><div class="card"><h3>Vagas · ${lb}</h3><div class="grid" style="margin-top:10px">${mods}</div></div>` +
    `<div class="card"><h3>Agendamentos · ${lb}</h3><div class="chips">${[['all', 'Todos'], ['h', G.h], ['c', G.c], ['v', G.v]].map(([k, t]) => `<button class="${flt === k ? 'on' : ''}" data-a="flt" data-v="${k}">${t}</button>`).join('')}</div>${rows}</div><div class="card"><h3>Pausas programadas</h3>${pl}</div>`;
}

function vEstadias() {
  let L = D.reservas.filter((r) => grupo(r) === 'h');
  if (pfl === 'pend') L = L.filter((r) => ativo(r) && !r.pago);
  if (pfl === 'pago') L = L.filter((r) => ativo(r) && r.pago);
  L = L.slice().sort((a, b) => (a.entrada < b.entrada ? 1 : -1)).slice(0, 150);
  const tr = L.map((r) => {
    const stt = !ativo(r) ? `<span class="tag ${ST[r.status][1]}">${ST[r.status][0]}</span>` : `<button class="tag ${r.pago ? 't-ok' : 't-w'}" data-a="pago" data-v="${r.id}" title="Clique para alternar">${r.pago ? 'Pago' : 'Pendente'}</button>`;
    return `<tr class="${ativo(r) ? '' : 'dim'}"><td>${emo(r)} <b>${pets(r)}</b></td><td>${br(r.entrada)}${r.horaEntrada ? ' · ' + hh(r.horaEntrada) : ''}</td><td>${br(r.saida)}${r.horaSaida ? ' · ' + hh(r.horaSaida) : ''}</td><td>${dias(r)}</td><td><b>${R(r.total)}</b></td><td>${PAGN[r.pagamento] || r.pagamento}</td><td>${stt}</td><td class="o">${esc(r.obs) || '—'}</td><td>${r.comprovante ? `<a class="btn g s" target="_blank" rel="noopener" href="${esc(r.comprovante.url)}">📎</a> ` : ''}${ativo(r) ? `<button class="btn g s" data-a="edit" data-v="${r.id}">Editar</button>` : ''}</td></tr>`;
  }).join('');
  const chips = `<div class="chips">${[['all', 'Todas'], ['pend', 'Pendentes'], ['pago', 'Pagas']].map(([k, t]) => `<button class="${pfl === k ? 'on' : ''}" data-a="pfl" data-v="${k}">${t}</button>`).join('')}</div>`;
  return head('Controle da hospedagem', 'Entrada, saída, diárias e pagamento de cada estadia', newBtn) + chips +
    `<div class="card tw"><table><thead><tr><th>Pet</th><th>Entrada</th><th>Saída</th><th>Diárias</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Observações</th><th></th></tr></thead><tbody>${tr || '<tr><td colspan="9" class="sm">Nenhuma estadia.</td></tr>'}</tbody></table></div>`;
}

function vClientes() {
  const g = {};
  D.reservas.filter(ativo).forEach((r) => { const k = String(r.telefone).replace(/\D/g, '') || r.cliente; (g[k] = g[k] || []).push(r); });
  const L = Object.values(g).sort((a, b) => sum(b) - sum(a)).map((a) => {
    const f = a[0], pend = sum(a.filter((r) => !r.pago)), nomes = [...new Set(a.flatMap((r) => r.pets))].join(', ');
    return `<div class="row"><div class="av">👤</div><div class="grow"><b>${esc(f.cliente)}</b><div class="sm">${esc(nomes) || '—'} · ${a.length} atendimento${a.length > 1 ? 's' : ''} · <a href="${esc(zap(f.telefone))}" target="_blank" rel="noopener">${esc(f.telefone)}</a></div></div><div style="text-align:right"><b>${R(sum(a))}</b><div class="sm">${pend ? `<span class="tag t-w">${R(pend)} pendente</span>` : '<span class="tag t-ok">Em dia</span>'}</div></div></div>`;
  }).join('');
  return head('Clientes', 'Tutores, pets e quanto cada um já gastou') + `<div class="card">${L || '<div class="sm">Sem clientes ainda.</div>'}</div>`;
}

function vRelBase() {
  const A = D.reservas.filter(ativo), H = D.hoje, ds = [...Array(14)].map((_, k) => add(H, k));
  const pc = (v, m) => (m ? v / m * 100 : 0);
  const cards = Object.entries(G).map(([k, t]) => {
    const a = A.filter((r) => grupo(r) === k);
    const oc = k === 'h' ? pc(ds.reduce((s, d) => s + nCaes(d), 0) / 14, D.limiteVagas) : k === 'c' ? null : null;
    return `<div class="mod"><b>${t}</b><div class="big" style="margin-top:8px">${a.length}</div><div class="sm">atendimentos · ${R(sum(a))}</div>${oc === null ? '' : `<div class="bar"><u class="${oc >= 100 ? 'z' : oc > 70 ? 'f' : ''}" style="width:${Math.min(100, oc)}%"></u></div><div class="sm">Cães (hospedagem + creche), ocupação média nos próx. 14 dias: ${oc.toFixed(0)}%</div>`}</div>`;
  }).join('');
  const t = {}; A.forEach((r) => { const k = r.cliente; t[k] = (t[k] || 0) + r.total; });
  const tp = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5), mx = tp[0] ? tp[0][1] : 1;
  const can = D.reservas.filter((r) => r.status === 'cancelado').length, exp = D.reservas.filter((r) => r.status === 'expirado').length;
  return head('Relatórios', 'Resumo por modalidade e melhores clientes') + `<div class="grid">${cards}</div><div class="card"><h3>Top clientes por receita</h3>${tp.map(([n, v]) => `<div style="margin-top:10px"><div class="top"><b>${esc(n)}</b><span>${R(v)}</span></div><div class="bar"><u style="width:${v / mx * 100}%"></u></div></div>`).join('') || '<div class="sm">Sem dados.</div>'}</div><div class="card"><h3>Cancelamentos</h3><div class="sm" style="margin-top:6px">${can} cancelado${can === 1 ? '' : 's'} · ${exp} expirado${exp === 1 ? '' : 's'} (sem comprovante no prazo).</div></div>`;
}


const num = (v) => String(v ?? '').replace('.', ',');
const pin = (id, v, extra = '') => `<input id="${id}" inputmode="decimal" type="number" min="0" step="0.01" value="${v}" ${extra}>`;
function vValores() {
  const p = D.precos, pd = D.precosPadrao;
  const dif = JSON.stringify(p) !== JSON.stringify(pd);
  const quando = D.precosAtualizadoEm ? new Date(D.precosAtualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const hint = (v) => `<span class="sm">Padrão: ${R(v)}</span>`;
  const aviso = `<div class="banner"><div style="font-size:30px">🛡️</div><div class="grow"><b>Só vale para novos agendamentos</b><span class="sm" style="color:inherit">Reservas já lançadas (pagas ou pendentes) mantêm o valor, o sinal e o saldo que já foram gravados. Alterar a tabela não mexe no fluxo financeiro existente.</span></div></div>`;
  const campos = (tit, html) => `<div class="card"><h3>${tit}</h3><div class="fg" style="margin-top:10px">${html}</div></div>`;
  return head('Valores', 'Tabela de preços usada no site, no cálculo de novas reservas e no novo agendamento' + (quando ? ' · última alteração ' + quando : dif ? '' : ' · usando valores padrão')) + aviso +
    campos('🏠 Hospedagem (cão e gato)', `<label>Diária por pet (R$)${pin('pv-h', p.hospedagem)}${hint(pd.hospedagem)}</label>`) +
    campos('🎾 Creche · plano mensal', [1, 2, 3, 4, 5].map((n) => `<label>${n}x por semana (R$)${pin('pv-c' + n, p.creche[n])}${hint(pd.creche[n])}</label>`).join('')) +
    campos('🚪 Visita em casa · por dia', [1, 2].map((n) => `<label>${n} visita${n > 1 ? 's' : ''} por dia (R$)${pin('pv-d' + n, p.domiciliar[n])}${hint(pd.domiciliar[n])}</label>`).join('')) +
    campos('💳 Sinal de reserva', `<label>Sinal para gerar o protocolo (R$)${pin('pv-s', p.sinal)}${hint(pd.sinal)}</label>`) +
    `<div class="card noprint" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn g" data-a="precoPadrao">↺ Restaurar valores padrão</button><button class="btn" data-a="salvarPrecos">Salvar valores</button></div>`;
}
function lerPrecos() {
  const v = (id) => $(id).value.replace(',', '.');
  return { hospedagem: v('pv-h'), creche: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, v('pv-c' + n)])), domiciliar: Object.fromEntries([1, 2].map((n) => [n, v('pv-d' + n)])), sinal: v('pv-s') };
}

// Sugestão do total no "Novo agendamento", pela tabela vigente (o campo continua editável).
let totalManual = false;
function sugerirTotal() {
  if (!$('ftot')) return;
  const sv = $('fs').value, p = D.precos, n = Math.max(0, diff($('fi').value || sel, $('fo').value || sel));
  const qp = Math.max(1, $('fp').value.split(',').map((x) => x.trim()).filter(Boolean).length);
  $('fplw').hidden = !(sv === 'creche' || sv === 'domiciliar');
  const pl = $('fpl');
  const cur = pl.value;
  const lista = sv === 'domiciliar' ? [['1', '1 visita por dia'], ['2', '2 visitas por dia']] : [['1', '1x por semana'], ['2', '2x por semana'], ['3', '3x por semana'], ['4', '4x por semana'], ['5', '5x por semana']];
  if (pl.dataset.sv !== sv) { pl.innerHTML = opt(lista, sv === 'domiciliar' ? '1' : '5'); pl.dataset.sv = sv; }
  else pl.value = cur;
  const k = Number(pl.value);
  let t = 0, txt = '';
  if (sv === 'creche') { t = p.creche[k]; txt = `Plano ${k}x por semana`; }
  else if (sv === 'domiciliar') { const d = n + 1; t = p.domiciliar[k] * d; txt = `${d} dia(s) × ${R(p.domiciliar[k])}`; }
  else { t = n * qp * p.hospedagem; txt = `${n} diária(s) × ${qp} pet(s) × ${R(p.hospedagem)}`; }
  $('fhint').textContent = `Sugestão pela tabela de valores: ${txt} = ${R(t)}${totalManual ? ' (valor digitado manualmente mantido)' : ''}`;
  if (!totalManual) $('ftot').value = t;
}

const ex = { de: '', ate: '', g: 'all', st: 'ativas' };
const brf = (v) => v.slice(8) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);
function exFiltro() {
  return D.reservas
    .filter((r) => (ex.st === 'todas' || ativo(r)) && (ex.g === 'all' || grupo(r) === ex.g) && (!ex.de || r.saida >= ex.de) && (!ex.ate || r.entrada <= ex.ate))
    .sort((a, b) => (a.entrada < b.entrada ? -1 : a.entrada > b.entrada ? 1 : a.id - b.id));
}
function vRel() {
  if (!ex.de) { const y = +D.hoje.slice(0, 4), m = +D.hoje.slice(5, 7); ex.de = D.hoje.slice(0, 8) + '01'; ex.ate = ISO(new Date(y, m, 0)); }
  const L = exFiltro(), tot = sum(L), pago = sum(L.filter((r) => r.pago));
  const sel2 = (k, a, v) => `<select data-ex="${k}">${opt(a, v)}</select>`;
  const rows = L.slice(0, 400).map((r) => `<tr><td>${brf(r.entrada)}</td><td>${brf(r.saida)}</td><td>${pets(r)}</td><td>${esc(r.cliente)}</td><td>${SV[r.servico].n}</td><td>${R(r.total)}</td><td>${PAGN[r.pagamento] || r.pagamento}</td><td>${r.pago ? 'Pago' : 'Pendente'}</td><td>${ST[r.status][0]}</td></tr>`).join('');
  return vRelBase() +
    `<div class="card noprint"><h3>Exportar relatório</h3><div class="fg" style="margin-top:10px"><label>De<input type="date" data-ex="de" value="${ex.de}"></label><label>Até<input type="date" data-ex="ate" value="${ex.ate}"></label><label>Modalidade${sel2('g', [['all', 'Todas'], ['h', 'Hospedagem'], ['c', 'Creche'], ['v', 'Visita em casa']], ex.g)}</label><label>Incluir${sel2('st', [['ativas', 'Só ativas'], ['todas', 'Todas (com canceladas)']], ex.st)}</label></div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-a="csv">⬇ Baixar planilha (Excel/CSV)</button><button class="btn g" data-a="imprimir">🖨 Imprimir / salvar PDF</button></div></div>` +
    `<div class="card"><h3>Relatório · ${ex.de ? brf(ex.de) : 'início'} a ${ex.ate ? brf(ex.ate) : 'hoje'}</h3><div class="sm" style="margin:4px 0 10px">${L.length} registro${L.length === 1 ? '' : 's'} · Total ${R(tot)} · Pago ${R(pago)} · Pendente ${R(tot - pago)}${L.length > 400 ? ' · prévia mostra 400; a planilha leva todos' : ''}</div><div class="tw"><table><thead><tr><th>Entrada</th><th>Saída</th><th>Pet(s)</th><th>Tutor</th><th>Serviço</th><th>Total</th><th>Pagamento</th><th>Pago</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="sm">Nenhum registro no período.</td></tr>'}</tbody></table></div></div>`;
}
function baixarCSV() {
  const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const cab = ['Protocolo', 'Cliente', 'Telefone', 'Serviço', 'Pets', 'Entrada', 'Saída', 'Diárias', 'Total (R$)', 'Pagamento', 'Pago', 'Status', 'Observações'];
  const linhas = exFiltro().map((r) => [r.protocolo, r.cliente, r.telefone, SV[r.servico].n, r.pets.join(', '), brf(r.entrada), brf(r.saida), dias(r), r.total.toFixed(2).replace('.', ','), PAGN[r.pagamento] || r.pagamento, r.pago ? 'Sim' : 'Não', ST[r.status][0], r.obs]);
  const txt = '\ufeff' + [cab, ...linhas].map((l) => l.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = `patinhas-relatorio-${ex.de || 'inicio'}_${ex.ate || 'hoje'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Planilha gerada ✅');
}

const openM = (h) => { $('mc').innerHTML = h; $('md').classList.add('on'); };
const closeM = () => $('md').classList.remove('on');
const opt = (a, v) => a.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');
const foot = (a) => `<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end"><button class="btn g" data-a="fechar">Fechar</button><button class="btn" data-a="${a}">Salvar</button></div>`;

function formNovo() {
  openM(`<h3>Novo agendamento</h3><div class="fg" style="margin-top:12px"><label>Serviço<select id="fs">${opt(Object.entries(SV).map(([k, v]) => [k, v.n]), 'hospedagem_cao')}</select></label><label>Tutor<input id="ft"></label><label>Telefone (com DDD)<input id="ftel" inputmode="tel"></label><label>Pets (separe por vírgula)<input id="fp"></label><label>Entrada<input type="date" id="fi" value="${sel}"></label><label>Saída<input type="date" id="fo" value="${add(sel, 2)}"></label><label>Hora entrada<input type="time" id="fhi" value="10:00"></label><label>Hora saída<input type="time" id="fho" value="17:00"></label><label id="fplw" hidden>Plano / visitas<select id="fpl"></select></label><label>Total (R$)<input type="number" min="0" step="0.01" id="ftot"></label><label>Pagamento<select id="fpay">${opt(PAGS, 'pix')}</select></label></div><label style="margin-top:10px"><span><input type="checkbox" id="fpd" style="width:auto"> Já está pago</span></label><label style="margin-top:10px">Observações<input id="fob"></label><div class="sm" style="margin-top:8px">Creche: usa segunda a sexta dentro do período. Visita em casa: todos os dias do período. O sistema confere as vagas antes de salvar.</div><div class="sm" id="fhint" style="margin-top:6px"></div>${foot('salvarNovo')}`);
  totalManual = false;
  sugerirTotal();
}
function formEditar(id) {
  const r = D.reservas.find((x) => x.id === id);
  openM(`<h3>Editar · ${pets(r)}</h3><div class="sm">${SV[r.servico].n} · ${esc(r.cliente)} · ${br(r.entrada)} → ${br(r.saida)}. Para mudar datas, cancele e crie outro.</div><input type="hidden" id="eid" value="${r.id}"><div class="fg" style="margin-top:12px"><label>Total (R$)<input type="number" min="0" step="0.01" id="etot" value="${r.total}"></label><label>Pagamento<select id="epay">${opt(PAGS, r.pagamento)}</select></label></div><label style="margin-top:10px"><span><input type="checkbox" id="epd" style="width:auto" ${r.pago ? 'checked' : ''}> Já está pago</span></label><label style="margin-top:10px">Observações<input id="eob" value="${esc(r.obs)}"></label>${foot('salvarEdit')}`);
}
function formPausa() {
  openM(`<h3>Pausar agendamentos</h3><div class="sm">Bloqueia só novos pedidos pelo site. Reservas já feitas continuam valendo.</div><div class="fg" style="margin-top:12px"><label>Modalidade<select id="pm"><option value="todos">Todas</option>${opt(Object.entries(SV).map(([k, v]) => [k, v.n]), '')}</select></label><label>De<input type="date" id="pa" value="${sel}"></label><label>Até<input type="date" id="pb" value="${add(sel, 2)}"></label></div><label style="margin-top:10px">Motivo (opcional)<input id="pw" placeholder="Ex.: feriado, viagem"></label>${foot('salvarPausa').replace('>Salvar<', '>Pausar<')}`);
}

const H = {
  go: (v) => { tab = v; render(); scrollTo(0, 0); },
  dia: (v) => { sel = v; render(); },
  flt: (v) => { flt = v; render(); },
  pfl: (v) => { pfl = v; render(); },
  reload: () => load(),
  instalar: async () => { if (!promptInstalar) return; promptInstalar.prompt(); try { await promptInstalar.userChoice; } catch (_) {} promptInstalar = null; mostrarInstalar(); },
  csv: baixarCSV,
  imprimir: () => window.print(),
  fechar: closeM,
  novo: formNovo,
  edit: (v) => formEditar(Number(v)),
  pausar: formPausa,
  cap: (v) => run(() => api('limite', { limite: Math.max(0, D.limiteVagas + Number(v)) })),
  pago: (v) => { const r = D.reservas.find((x) => x.id === Number(v)); run(() => api(`reservas/${r.id}/editar`, { pago: !r.pago }), r.pago ? 'Marcado como pendente' : 'Marcado como pago'); },
  conf: (v) => { if (confirm('Confirmar o pagamento e a reserva?')) run(() => api(`reservas/${v}/confirmar`, {}), 'Reserva confirmada ✅'); },
  canc: (v) => { if (confirm('Cancelar esta reserva? As vagas serão liberadas.')) run(() => api(`reservas/${v}/cancelar`, {}), 'Reserva cancelada'); },
  retomar: (v) => run(() => api(`pausas/${v}/remover`, {}), '▶ Agendamentos retomados'),
  salvarNovo: () => {
    const corpo = { servico: $('fs').value, cliente: $('ft').value, telefone: $('ftel').value, pets: $('fp').value.split(','), entrada: $('fi').value, saida: $('fo').value, horaEntrada: $('fhi').value, horaSaida: $('fho').value, total: $('ftot').value === '' ? NaN : Number($('ftot').value), pagamento: $('fpay').value, pago: $('fpd').checked, obs: $('fob').value };
    if (Number.isNaN(corpo.total)) return toast('Informe o valor total');
    run(async () => { await api('reservas', corpo); closeM(); }, 'Agendamento criado ✅');
  },
  salvarEdit: () => run(async () => { await api(`reservas/${$('eid').value}/editar`, { total: Number($('etot').value), pagamento: $('epay').value, pago: $('epd').checked, obs: $('eob').value }); closeM(); }, 'Salvo ✅'),
  salvarPrecos: () => {
    if (!confirm('Salvar os novos valores? Valem só para novos agendamentos; reservas já lançadas não mudam.')) return;
    run(() => api('precos', lerPrecos()), 'Valores atualizados ✅');
  },
  precoPadrao: () => { if (confirm('Voltar para os valores padrão? Reservas já lançadas não mudam.')) run(() => api('precos/restaurar', {}), 'Valores padrão restaurados'); },
  salvarPausa: () => run(async () => { await api('pausas', { servico: $('pm').value, inicio: $('pa').value, fim: $('pb').value, motivo: $('pw').value }); closeM(); }, '⏸ Agendamentos pausados'),
};

let promptInstalar = null;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function mostrarInstalar() {
  const el = $('inst');
  if (!el) return;
  if (standalone()) { el.hidden = true; return; }
  if (promptInstalar) {
    el.innerHTML = '<button class="btn s" data-a="instalar">📲 Instalar como app</button>';
    el.hidden = false;
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    el.innerHTML = '<p>Para instalar: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>';
    el.hidden = false;
  }
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; mostrarInstalar(); });
window.addEventListener('appinstalled', () => { promptInstalar = null; $('inst').hidden = true; toast('App instalado ✅'); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/controle-sw.js', { scope: '/controle/' }).catch(() => {});
mostrarInstalar();

document.addEventListener('click', (e) => {
  if (e.target.id === 'md') return closeM();
  const b = e.target.closest('[data-a]');
  if (b && H[b.dataset.a]) H[b.dataset.a](b.dataset.v);
});
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'ftot') totalManual = e.target.value !== '';
  else if (['fs', 'fp', 'fi', 'fo', 'fpl'].includes(id)) { if (id === 'fs') totalManual = false; sugerirTotal(); }
});
document.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.ex; if (k) { ex[k] = e.target.value; render(); } });
load();
