// uso: node teste.js "2026-09-30|08:00" [quantidade]
const slot = process.argv[2];
const n = parseInt(process.argv[3] || '1');

const reqs = Array.from({ length: n }, (_, i) =>
  fetch('http://localhost:3000/agendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ slot, nome: `Teste ${i}`, cpf: `000.000.000-0${i}` })
  }).then(r => r.status)
);

Promise.all(reqs).then(s => console.log('Status:', s));