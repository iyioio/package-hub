#!/usr/bin/env node

import chalk from 'chalk';
import * as fs from 'fs';
import { dbDir, loadJson, lockDir, setVerbose, takeArgs, verbose } from './common';
import { exit, processInit } from './process';
import { useTargetProject } from './target';
import { runHub } from './hub';
import { ArgConfig } from './types';
import path from 'path';


function main(){

    if(!fs.existsSync(dbDir)){
        fs.mkdirSync(dbDir,{recursive:true});
    }
    if(!fs.existsSync(lockDir)){
        fs.mkdirSync(lockDir,{recursive:true});
    }

    processInit();

    let sessionName='default';

    let targetProjects:string[]=[];

    let deleteCache=false;

    let args=[...process.argv];

    args.splice(0,2);

    if(args.length && args[0][0]!=='-'){
        args.unshift('-config')
    }

    if(args.length===0){
        args=['-config','pkhub-config.json'];
    }

    for(let i=0;i<args.length;i++){
        const cmdArgs=takeArgs(args,i+1);
        switch(args[i].toLowerCase()){

            case '-verbose':
            case '-v':
                setVerbose(cmdArgs.length?Boolean(cmdArgs[0]):true);
                break;

            case '-config':
                for(const a of cmdArgs){
                    args=[...args,...loadConfig(a)];
                }
                break;

            case '-exit':
                exit(Number(cmdArgs[0]||0));
                break;

            case '-delete-cache':
                deleteCache=cmdArgs.length?Boolean(cmdArgs[0]):true;
                break;

            case '-session':
                sessionName=cmdArgs[0]||'default';
                break;

            case "-hub":
                for(const a of cmdArgs){
                    runHub(a,sessionName);
                }
                break;

            case '-target':
                targetProjects=cmdArgs;
                break;
            
            case '-use':
                for(const p of targetProjects){
                    for(const pk of cmdArgs){
                        useTargetProject(p,pk,deleteCache,sessionName);
                    }
                }
                break;

            default:
                throw new Error(`Unknown arg [${args[i].toLowerCase()}]`)
        }
        i+=cmdArgs.length;
    }
}

function loadConfig(configPath:string):string[]
{
    const config=loadJson<ArgConfig>(configPath);
    const dir=path.dirname(configPath);

    let args:string[]=[];

    if(config.session!==undefined){
        args.push('-session');
        args.push(config.session)
    }

    if(config.verbose!==undefined){
        args.push('-verbose');
        args.push(config.verbose.toString())
    }

    if(config.deleteCache!==undefined){
        args.push('-delete-cache');
        args.push(config.deleteCache.toString())
    }

    if(config.hubs!==undefined){
        args.push('-hub');
        for(const p of config.hubs){
            args.push(path.isAbsolute(p)?p:path.join(dir,p));
        }
    }

    if(config.targets!==undefined){
        args.push('-target');
        for(const p of config.targets){
            args.push(path.isAbsolute(p)?p:path.join(dir,p));
        }
    }

    if(config.use!==undefined){
        args.push('-use');
        for(const u of config.use){
            args.push(u);
        }
    }

    if(config.args!==undefined){
        args=[...args,...config.args]
    }

    if(config.extends!==undefined){
        args.push("-config");
        for(const p of config.extends){
            args.push(path.isAbsolute(p)?p:path.join(dir,p));
        }
    }

    if(config.exit!==undefined){
        args.push('-exit');
        args.push(config.exit.toString())
    }

    return args;
}

try{
    main()
}catch(ex:any){
    if(verbose){
        console.error(chalk.red('package-hub encountered an error'),ex);
    }else{
        console.error(chalk.red('package-hub encountered an error'),ex.message);
    }
    exit();
    process.exitCode=1;
}
