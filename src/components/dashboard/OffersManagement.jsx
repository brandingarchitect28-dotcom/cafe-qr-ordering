// CSS PATCH — Replace existing CSS injection block with this one
// Find: document.getElementById('ofm2-food-css') block

if (typeof document !== 'undefined' && !document.getElementById('ofm2-food-css')) {
  const el = document.createElement('style');
  el.id = 'ofm2-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .ofm2 { font-family: 'DM Sans', system-ui, sans-serif; }
    .ofm2-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    .ofm2-card {
      background: linear-gradient(160deg, #1a1208 0%, #130e05 100%);
      border: 1.5px solid rgba(255,140,0,0.14);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 220ms, box-shadow 220ms, transform 200ms;
      position: relative;
    }
    .ofm2-card::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, #FF7A20, #FFBE0B, #FF7A20);
      opacity: 0; transition: opacity 200ms;
    }
    .ofm2-card:hover { border-color: rgba(255,140,0,0.32); box-shadow: 0 10px 36px rgba(0,0,0,0.6); transform: translateY(-3px); }
    .ofm2-card:hover::before { opacity: 1; }
    .ofm2-flat { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 14px; }
    .ofm2-section { background: rgba(255,140,0,0.04); border: 1.5px solid rgba(255,140,0,0.12); border-radius: 13px; padding: 16px; }
    .ofm2-subcard { background: rgba(255,255,255,0.03); border: 1.5px solid rgba(255,255,255,0.07); border-radius: 10px; }

    .ofm2-btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 7px 14px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .ofm2-btn:hover  { transform: translateY(-1px); filter: brightness(1.10); }
    .ofm2-btn:active { transform: scale(0.96); }
    .ofm2-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.30); }
    .ofm2-btn-orange:hover { box-shadow: 0 5px 18px rgba(255,120,0,0.45); }
    .ofm2-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .ofm2-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .ofm2-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .ofm2-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .ofm2-btn-green  { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.22); }
    .ofm2-btn-green:hover  { background: rgba(16,185,129,0.22); }
    .ofm2-btn-yellow { background: rgba(255,190,11,0.12); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .ofm2-btn-yellow:hover { background: rgba(255,190,11,0.22); }

    .ofm2-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 11px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .ofm2-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.10); }
    .ofm2-input::placeholder { color: #3d3020; }
    .ofm2-input:disabled { opacity: 0.5; cursor: not-allowed; }

    .ofm2-select {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 11px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; cursor: pointer; transition: border-color 180ms;
    }
    .ofm2-select:focus { border-color: rgba(255,140,0,0.55); }
    .ofm2-select option { background: #1c1509; }

    .ofm2-label {
      display: block; font-size: 11px; font-weight: 900; margin-bottom: 6px;
      color: #a08060; text-transform: uppercase; letter-spacing: 0.07em;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .ofm2-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #FF7A20; display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .ofm2-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 800;
      border: 1.5px solid transparent;
      font-family: 'DM Sans', system-ui, sans-serif;
    }
    .ofm2-stat {
      background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 13px;
      padding: 14px 16px; display: flex; align-items: center; gap: 12px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .ofm2-stat:hover { border-color: rgba(255,140,0,0.22); box-shadow: 0 4px 18px rgba(0,0,0,0.4); }
    .ofm2-sheet { background: linear-gradient(180deg, #1e1408 0%, #150f06 100%); border: 1.5px solid rgba(255,140,0,0.18); box-shadow: 0 -20px 60px rgba(255,120,0,0.14); }
    .ofm2-sheet-grip { width:36px; height:4px; border-radius:4px; background:rgba(255,140,0,0.28); }
    .ofm2-toggle-track { width:40px; height:22px; border-radius:11px; display:flex; align-items:center; padding:2px; cursor:pointer; transition:background 200ms; flex-shrink:0; }
    .ofm2-toggle-thumb { width:18px; height:18px; border-radius:50%; background:#fff; transition:transform 200ms; box-shadow:0 1px 4px rgba(0,0,0,0.35); }
    .ofm2-picker-item { padding: 10px 12px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); text-align: left; cursor: pointer; transition: all 180ms; font-family: 'DM Sans', system-ui, sans-serif; }
    .ofm2-picker-item:hover { border-color: rgba(255,140,0,0.3); background: rgba(255,140,0,0.06); }
    .ofm2-picker-item-selected { border-color: rgba(255,140,0,0.45) !important; background: rgba(255,140,0,0.10) !important; }
    .ofm2-type-btn { padding: 16px; border-radius: 13px; border: 1.5px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); text-align: left; cursor: pointer; transition: all 200ms; font-family: 'DM Sans', system-ui, sans-serif; }
    .ofm2-type-btn:hover { border-color: rgba(255,140,0,0.28); background: rgba(255,140,0,0.06); transform: translateY(-1px); }
    .ofm2-type-btn-active { border-color: rgba(255,140,0,0.50) !important; background: rgba(255,140,0,0.12) !important; box-shadow: 0 0 0 3px rgba(255,140,0,0.08); }
    .ofm2-scroll::-webkit-scrollbar { width:4px; height:4px; }
    .ofm2-scroll::-webkit-scrollbar-track { background:transparent; }
    .ofm2-scroll::-webkit-scrollbar-thumb { background:rgba(255,140,0,0.25); border-radius:4px; }
    @keyframes ofm2In { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .ofm2-in { animation: ofm2In 260ms ease forwards; }
    .ofm2-size-btn { padding: 9px 18px; border-radius: 10px; border: 1.5px solid rgba(255,140,0,0.35); background: rgba(255,140,0,0.08); color: #FF7A20; font-weight: 800; font-size: 13px; cursor: pointer; transition: all 180ms; font-family: 'DM Sans', system-ui, sans-serif; }
    .ofm2-size-btn:hover { background: rgba(255,140,0,0.20); transform: translateY(-1px); }
  `;
  document.head.appendChild(el);
}
