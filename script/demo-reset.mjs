// Rebuilds the demo hospitals' sectors, beds and medication requests (pitch rehearsal reset).
// Usage: pnpm run demo:reset
import { runConvex } from './lib.mjs';

runConvex(`npx convex run demo:seedHospitals "{\\"reset\\":true}"`, {
  logLabel: 'Recriando os dados de exemplo dos hospitais...',
});
console.log('Dados de exemplo recriados.');
