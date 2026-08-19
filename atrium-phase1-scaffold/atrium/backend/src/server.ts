import 'dotenv/config';
import { buildApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const INSTANCE_ID = process.env.INSTANCE_ID ?? 'api-unknown';

const app = buildApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${INSTANCE_ID}] Atrium API listening on port ${PORT}`);
});
