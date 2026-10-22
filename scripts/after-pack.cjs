const {createHash}=require('node:crypto');
const {readdir,readFile,writeFile}=require('node:fs/promises');
const path=require('node:path');
// Runs after executable editing/signing so the manifest describes shipped bytes.
module.exports=async context=>{
    const root=context.appOutDir,files=[];
    async function visit(dir){
        for(const entry of await readdir(dir,{withFileTypes:true})){
            const target=path.join(dir,entry.name),relative=path.relative(root,target).replaceAll('\\','/');
            if(entry.isDirectory())await visit(target);
            else if(entry.isFile() && relative!=='integrity.json')files.push({path:relative,sha256:createHash('sha256').update(await readFile(target)).digest('hex')});
        }
    }
    await visit(root);files.sort((a,b)=>a.path.localeCompare(b.path));
    await writeFile(path.join(root,'integrity.json'),JSON.stringify({version:context.packager.appInfo.version,files},null,2));
};
