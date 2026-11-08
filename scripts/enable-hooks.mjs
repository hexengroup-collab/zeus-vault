// Sets core.hooksPath to this repo's .githooks so the pre-push guard is active.
// Failures are ignored — this must never break `npm install`.
import { spawnSync } from 'node:child_process'

const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore', shell: true })
if (r.status === 0) {
  console.log('git hooks enabled: core.hooksPath -> .githooks')
}
