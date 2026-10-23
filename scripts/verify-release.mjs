import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),version=pkg.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
const root=path.resolve('release', 'v'+version),dir=path.join(root,'win-unpacked');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'integrity.json'),'utf8'));
if(manifest.version!==version)throw Error('Integrity version mismatch');
for(const f of manifest.files){
 const target=path.resolve(dir,f.path);
 if(!target.startsWith(dir+path.sep))throw Error('Invalid manifest path');
 if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==f.sha256)throw Error('Integrity: '+f.path);
}
const require=createRequire(import.meta.resolve('electron-builder')),asar=require('@electron/asar');
const archive=path.join(dir,'resources/app.asar'),packed=JSON.parse(asar.extractFile(archive,'package.json'));
if(packed.version!==version||packed.name!==pkg.name)throw Error('Packaged version/identity mismatch');
const entries=asar.listPackage(archive);
if(entries.some(f=>/(?:^|[\\/])(tests|\.build-cache|history\.json|personal-weights\.json|Cookies)(?:[\\/]|$)/.test(f)))throw Error('Unexpected test/private file');
const yaml=fs.readFileSync(path.join(root,'latest.yml'),'utf8'),exe='danmakullottery-'+version+'-x64.exe';
const hash=crypto.createHash('sha512').update(fs.readFileSync(path.join(root,exe))).digest('base64');
if(!yaml.includes(hash)||!yaml.includes(exe)||!yaml.includes('version: '+version))throw Error('Update metadata mismatch');
const folder='danmakullottery-Windows-x64-v'+version,zip=path.join(root,folder+'.zip');
const listing=execFileSync(require('7zip-bin').path7za,['l','-slt',zip],{encoding:'utf8',windowsHide:true});
const paths=listing.split('----------')[1]?.split(/\r?\n/).filter(s=>s.startsWith('Path = ')).map(s=>s.slice(7))??[];
if(!paths.length||paths.some(s=>s!==folder&&!s.startsWith(folder+'/')&&!s.startsWith(folder+'\\')))throw Error('ZIP has unexpected top-level paths');
console.log(JSON.stringify({version,integrityFiles:manifest.files.length,asarEntries:entries.length,updateSha512:'verified',zipEntries:paths.length,zipTopLevel:folder},null,2));
