// CSS PATCH — Replace existing CSS injection block with this one
// Find: document.getElementById('inv-mgmt-css') block

if (typeof document !== 'undefined' && !document.getElementById('inv-mgmt-css')) {
  const el = document.createElement('style');
  el.id = 'inv-mgmt-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .imv { font-family: 'DM Sans', system-ui, sans-serif; }
    .imv-title { font-family: 'Playfair Display', serif !important; }
    .imv-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      transition: border-color 200ms;
    }
    .imv-card:hover { border-color: rgba(255,140,0,0.18); }
    .imv-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .imv-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }
    .imv-input::placeholder { color: #3d3020; }
    .imv-select {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 9px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; cursor: pointer; transition: border-color 160ms;
    }
    .imv-select:focus { border-color: rgba(255,140,0,0.5); }
    .imv-select option { background: #1c1509; }
    .imv-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 13px;
      padding: 8px 16px; border-radius: 12px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .imv-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .imv-btn:active { transform: scale(0.96); }
    .imv-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.3); }
    .imv-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .imv-btn-ghost:hover { background: rgba(255,255,255,0.09); color: #fff; }
    .imv-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .imv-btn-red:hover { background: rgba(220,50,50,0.22); }
    .imv-row { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 150ms; }
    .imv-row:hover { background: rgba(255,140,0,0.03); }
    @keyframes imvIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .imv-in { animation: imvIn 250ms ease forwards; }
  `;
  document.head.appendChild(el);
}
