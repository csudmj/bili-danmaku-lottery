import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),bin=path.join(path.dirname(require.resolve('eslint/package.json')),'bin/eslint.js');
const result=spawnSync(process.execPath,[bin,'src','electron','shared','--ext','ts,tsx','--report-unused-disable-directives','--max-warnings','0'],{env:{...process.env,ESLINT_USE_FLAT_CONFIG:'false'},stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;
