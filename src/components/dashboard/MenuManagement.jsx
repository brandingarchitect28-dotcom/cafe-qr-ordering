// CSS PATCH — Replace existing CSS injection block with this one
// Find: document.getElementById('mm-food-css') block

if (typeof document !== 'undefined' && !document.getElementById('mm-food-css')) {
  const el = document.createElement('style');
  el.id = 'mm-food-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .mm { font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    .mm-card { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 16px; transition: border-color 200ms, box-shadow 200ms, transform 180ms; overflow: hidden; }
    .mm-card:hover { border-color: rgba(255,140,0,0.28); box-shadow: 0 8px 32px rgba(0,0,0,0.55); transform: translateY(-2px); }

    .mm-item-card { background: linear-gradient(160deg, #1a1208 0%, #130e05 100%); border: 1.5px solid rgba(255,140,0,0.14); border-radius: 16px; overflow: hidden; transition: border-color 220ms, box-shadow 220ms, transform 200ms; position: relative; }
    .mm-item-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #FF7A20, #FFBE0B, #FF7A20); opacity: 0; transition: opacity 200ms; }
    .mm-item-card:hover { border-color: rgba(255,140,0,0.35); box-shadow: 0 10px 36px rgba(0,0,0,0.6); transform: translateY(-3px); }
    .mm-item-card:hover::before { opacity: 1; }
    .mm-item-card-unavailable { opacity: 0.58; filter: grayscale(0.35); }

    .mm-btn { display: inline-flex; align-items: center; gap: 5px; font-family: 'DM Sans', system-ui, sans-serif; font-weight: 800; font-size: 12px; padding: 7px 14px; border-radius: 10px; border: 1.5px solid transparent; cursor: pointer; transition: all 180ms; white-space: nowrap; }
    .mm-btn:hover  { transform: translateY(-1px); filter: brightness(1.1); }
    .mm-btn:active { transform: scale(0.96); }
    .mm-btn-orange { background: linear-gradient(135deg,#FF7A20,#E55A00); color:#fff; box-shadow: 0 3px 12px rgba(255,120,0,0.3); }
    .mm-btn-orange:hover { box-shadow: 0 5px 18px rgba(255,120,0,0.45); }
    .mm-btn-ghost  { background: rgba(255,255,255,0.05); color: #7a6a55; border-color: rgba(255,255,255,0.08); }
    .mm-btn-ghost:hover  { background: rgba(255,255,255,0.09); color: #fff; }
    .mm-btn-red    { background: rgba(220,50,50,0.12); color: #ff7070; border-color: rgba(220,50,50,0.22); }
    .mm-btn-red:hover    { background: rgba(220,50,50,0.22); }
    .mm-btn-yellow { background: rgba(255,190,11,0.12); color: #fbbf24; border-color: rgba(255,190,11,0.22); }
    .mm-btn-yellow:hover { background: rgba(255,190,11,0.22); }
    .mm-btn-green  { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.22); }
    .mm-btn-green:hover  { background: rgba(16,185,129,0.22); }
    .mm-btn-blue   { background: rgba(99,102,241,0.12); color: #818cf8; border-color: rgba(99,102,241,0.22); }
    .mm-btn-blue:hover   { background: rgba(99,102,241,0.22); }

    .mm-input { background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px; color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600; font-family: 'DM Sans', system-ui, sans-serif; outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms; }
    .mm-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.10); }
    .mm-input::placeholder { color: #3d3020; }
    .mm-input:disabled { opacity: 0.5; cursor: not-allowed; }

    .mm-label { display: block; font-size: 11px; font-weight: 900; margin-bottom: 6px; color: #a08060; text-transform: uppercase; letter-spacing: 0.07em; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; border: 1.5px solid transparent; font-family: 'DM Sans', system-ui, sans-serif; }

    .mm-tab { padding: 6px 16px; border-radius: 22px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 180ms; border: 1.5px solid transparent; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-tab-on  { background: linear-gradient(135deg,#FF7A20,#E55A00); color: #fff; box-shadow: 0 3px 14px rgba(255,120,0,0.35); }
    .mm-tab-off { background: rgba(255,255,255,0.04); color: #7a6a55; border-color: rgba(255,255,255,0.07); }
    .mm-tab-off:hover { background: rgba(255,140,0,0.08); color: #FF7A20; border-color: rgba(255,140,0,0.2); }

    .mm-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
    .mm-scroll::-webkit-scrollbar-track { background: transparent; }
    .mm-scroll::-webkit-scrollbar-thumb { background: rgba(255,140,0,0.25); border-radius: 4px; }

    .mm-sheet { background: linear-gradient(180deg, #1e1408 0%, #150f06 100%); border: 1.5px solid rgba(255,140,0,0.18); box-shadow: 0 -20px 60px rgba(255,120,0,0.14); }
    .mm-sheet-grip { width: 36px; height: 4px; border-radius: 4px; background: rgba(255,140,0,0.28); }

    .mm-sec { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #FF7A20; display: flex; align-items: center; gap: 5px; font-family: 'DM Sans', system-ui, sans-serif; }
    .mm-stat { background: #141008; border: 1.5px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; transition: border-color 200ms, box-shadow 200ms; }
    .mm-stat:hover { border-color: rgba(255,140,0,0.22); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .mm-img-wrap { overflow: hidden; position: relative; background: #0d0a05; }
    .mm-img-wrap img, .mm-img-wrap video { width: 100%; height: 100%; object-fit: cover; transition: transform 350ms; }
    .mm-item-card:hover .mm-img-wrap img, .mm-item-card:hover .mm-img-wrap video { transform: scale(1.04); }
    .mm-price { font-family: 'Playfair Display', serif; color: #FF7A20; letter-spacing: 0.01em; }
    .mm-toggle-track { width: 40px; height: 22px; border-radius: 11px; display: flex; align-items: center; padding: 2px; cursor: pointer; transition: background 200ms; flex-shrink: 0; }
    .mm-toggle-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 200ms; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
    .mm-form-section { background: rgba(255,140,0,0.04); border: 1.5px solid rgba(255,140,0,0.12); border-radius: 14px; padding: 16px; }
    @keyframes mmSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .mm-in { animation: mmSlideIn 280ms ease forwards; }
    .mm-checkbox { width:18px; height:18px; border-radius:5px; border:1.5px solid rgba(255,140,0,0.35); background:#1c1509; appearance:none; cursor:pointer; transition:all 180ms; flex-shrink:0; }
    .mm-checkbox:checked { background:#FF7A20; border-color:#FF7A20; }
    .mm-checkbox:checked::after { content:'✓'; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-size:11px; font-weight:900; }
  `;
  document.head.appendChild(el);
}
