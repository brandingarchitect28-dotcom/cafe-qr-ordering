// CSS PATCH — Replace existing CSS injection block with this one
// Find: document.getElementById('inv-cafe-css')  block
// Replace the el.textContent = `...` with below:

if (typeof document !== 'undefined' && !document.getElementById('inv-cafe-css')) {
  const el = document.createElement('style');
  el.id = 'inv-cafe-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');
    .inv { font-family: 'DM Sans', system-ui, sans-serif; }
    .inv-title { font-family: 'Playfair Display', serif !important; }
    .inv-card {
      background: #141008;
      border: 1.5px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 200ms;
    }
    .inv-card:hover { border-color: rgba(255,140,0,0.22); }
    .inv-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 12px;
      padding: 6px 12px; border-radius: 10px;
      border: 1.5px solid transparent;
      cursor: pointer; transition: all 180ms;
      white-space: nowrap;
    }
    .inv-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
    .inv-btn:active { transform: scale(0.96); }
    .inv-btn-gold   { background: rgba(212,175,55,0.12); color: #D4AF37; border-color: rgba(212,175,55,0.25); }
    .inv-btn-gold:hover { background: rgba(212,175,55,0.22); }
    .inv-btn-green  { background: rgba(37,211,102,0.1); color: #25D366; border-color: rgba(37,211,102,0.25); }
    .inv-btn-green:hover { background: rgba(37,211,102,0.18); }
    .inv-input {
      background: #1c1509; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 12px;
      color: #fff8ee; padding: 10px 14px; font-size: 14px; font-weight: 600;
      font-family: 'DM Sans', system-ui, sans-serif;
      outline: none; width: 100%; transition: border-color 180ms, box-shadow 180ms;
    }
    .inv-input:focus { border-color: rgba(255,140,0,0.55); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }
    .inv-input::placeholder { color: #3d3020; }
    @keyframes invIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .inv-in { animation: invIn 280ms ease forwards; }
  `;
  document.head.appendChild(el);
}
