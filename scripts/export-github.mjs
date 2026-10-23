import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),pkg=JSON.parse(await readFile('package.json','utf8')),v=pkg.version;
if(!/^\d+\.\d+\.\d+$/.test(v))throw Error('Invalid version');
const release=path.resolve(root,'release'),source=path.join(release,'github-upload-v'+v),target=path.join(release,'github-release-v'+v);
for(const dir of [source,target]){if(path.dirname(dir)!==release)throw Error('Invalid export path');await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});}
const names=['.github','distribution','docs','electron','public','scripts','shared','src','tests','.eslintrc.cjs','.gitignore','CHANGELOG.md','electron-builder.json5','index.html','LICENSE','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','postcss.config.js','README.en.md','README.md','tailwind.config.js','THIRD_PARTY_LICENSES.txt','tsconfig.json','tsconfig.node.json','vite.config.ts'];
for(const name of names)await cp(path.join(root,name),path.join(source,name),{recursive:true});
for(const name of ['danmakullottery-'+v+'-x64.exe','danmakullottery-'+v+'-x64.exe.blockmap','latest.yml','danmakullottery-Windows-x64-v'+v+'.zip'])await cp(path.join(release,'v'+v,name),path.join(target,name));
const stage=path.resolve(root,'.build-cache','source-export-v'+v);
if(path.dirname(stage)!==path.resolve(root,'.build-cache'))throw Error('Invalid stage');
await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
const folder='bili-danmaku-lottery-v'+v;await cp(source,path.join(stage,folder),{recursive:true});
const zip=path.join(release,'bili-danmaku-lottery-source-v'+v+'.zip');await rm(zip,{force:true});
const req=createRequire(import.meta.resolve('electron-builder'));execFileSync(req('7zip-bin').path7za,['a','-tzip','-mx=7',zip,folder],{cwd:stage,windowsHide:true,stdio:'inherit'});
console.log(JSON.stringify({source,target,zip},null,2));
