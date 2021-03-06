import chalk from 'chalk';
import { parse } from 'comment-json';
import * as fs from 'fs';
import md5 from 'md5';
import os from 'os';
import path from 'path';
import { stdout } from 'process';
import lockfile from 'proper-lockfile';

export const userDir=path.join(os.homedir(),'.pkhub');
export const dbDir=path.join(userDir,'db');
export const lockDir=path.join(userDir,'locks');

export const backupExtension='.pkbk';

export function loadJson<T>(path:string):T{
    return parse(fs.readFileSync(path).toString())
}

export function tryLoadJson<T>(path:string):T|undefined{
    try{
        if(!fs.existsSync(path)){
            return undefined;
        }
        return loadJson<T>(path);
    }catch(ex:any){
        console.error(`Unable to load ${path} as json. Returning undefined`,ex);
        return undefined;
    }
}

const lockChecks:{[path:string]:boolean}={}
export function lockSync(lockPath:string,work:()=>void){

    if(!lockChecks[lockDir]){
        if(!fs.existsSync(lockDir)){
            fs.mkdirSync(lockDir,{recursive:true});
        }
        lockChecks[lockDir]=true;
    }

    lockPath=path.resolve(lockPath);

    const lockFilePath=path.join(lockDir,md5(lockPath)).toString();

    if(!lockChecks[lockFilePath]){
        let attempt=0;
        while(true){
            try{
                if(!fs.existsSync(lockFilePath)){
                    fs.writeFileSync(lockFilePath,lockPath);
                }
                break;
            }catch(ex:any){
                console.error(`Unable to create lock - ${lockPath}`);
            }
            attempt++;
            if(attempt>20){
                throw new Error(`Unable to create lock after 20 attempts - ${lockPath}`)
            }
            sleep(1000);
        }
        lockChecks[lockFilePath]=true;
    }

    const release=lockfile.lockSync(lockFilePath);
    try{
        work();
    }finally{
        release();
    }
}

export function saveJson(path:string, value:any, space?:number)
{
    fs.writeFileSync(path,JSON.stringify(value,null,space));
}


export function escapePackageName(pkName:string){
    return pkName.replace(/\//g,'__SLASH__');
}

export function unescapePackageName(pkName:string){
    return pkName.replace(/__SLASH__/g,'/');
}


export function takeArgs(args:string[],index:number):string[]
{
    const taken:string[]=[];

    for(;index<args.length;index++){
        const a=args[index];
        if(a && a[0]==='-'){
            break;
        }
        taken.push(a)
    }

    return taken;
}


export let verbose=false;
export function setVerbose(value:boolean)
{
    verbose=value;
}


let lastCmdOut:string='';
const printHeaderColor=chalk.rgb(90,90,90);
const printHeaderErrorColor=chalk.rgb(150,40,40);

export function printCmd(name:string,content:string,error:boolean){
    if(content.includes('\u001bc')){
        content=content.split('\u001bc').join('[[CLEAR]]')
    }

    const n=(error?'e:':'s:')+name;

    if(lastCmdOut!==n){
        lastCmdOut=n;
        content=(
            (error?printHeaderErrorColor:printHeaderColor)(`\n${error?'stderr':'stdout'} ${name}`)+
            '\n'+content
        )
    }
    stdout.write(content);
}

export function sleep(milliseconds:number){
    const date=Date.now();
    let currentDate=0;
    do{
        currentDate=Date.now();
    }while(currentDate-date<milliseconds);
}