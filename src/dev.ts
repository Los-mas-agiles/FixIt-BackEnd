import app from './index.js'
import { env } from './config/env.js'

app.listen(env.PORT, () => {
  console.log(`FixIt API en http://localhost:${env.PORT}/api/health`)
})
