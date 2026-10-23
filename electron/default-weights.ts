import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {LotteryPool,DEFAULT_WEIGHTS,type WeightRules} from './lottery.ts';

export function loadDefaultWeights(file:string):WeightRules{
    const validator=new LotteryPool();
    if(existsSync(file))validator.setWeightRules(JSON.parse(readFileSync(file,'utf8')),false);
    return validator.snapshot().weightRules;
}
export function applySavedWeights(file:string,pool:LotteryPool,rules:WeightRules,applyExisting:boolean,reset=false){
    const state=pool.snapshot();
    if(state.mode!=='lottery'&&state.participants.length)throw Error('排队模式不使用权重');
    const validator=new LotteryPool();validator.setWeightRules(reset?DEFAULT_WEIGHTS:rules,false);
    const validated=validator.snapshot().weightRules;
    mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file+'.tmp',JSON.stringify(validated,null,2),'utf8');
    renameSync(file+'.tmp',file);
    if(reset)pool.resetWeights();else pool.setWeightRules(validated,applyExisting);
}
