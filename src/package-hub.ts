#!/usr/bin/env node

import chalk from 'chalk';
import * as fs from 'fs';
import path from 'path';
import { dbDir, loadJson, lockDir, setVerbose, sleep, takeArgs, verbose } from './common';
import { runHub } from './hub';
import { initMetroTemplate, loadExtraNodeModules, metroConfigFile } from './metro-template';
import { exit, processInit } from './process';
import { cleanAllTargetProjects, cleanTargetProjects, useTargetProject } from './target';
import { ArgConfig } from './types';


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

    let keepAlive=false;

    let clean=false;

    let dryRun=false;

    args.splice(0,2);

    if(args.length && args[0][0]!=='-'){
        args.unshift('-config')
    }

    if(args.length===0){
        args=['-config','pkhub-config.json'];
    }

    if(args.length===1 && args[0]==='-clean'){
        args=['-clean','-config','pkhub-config.json'];
    }

    for(let i=0;i<args.length;i++){
        const cmdArgs=takeArgs(args,i+1);
        switch(args[i].toLowerCase()){

            case '-verbose':
            case '-v':
                setVerbose(cmdArgs.length?JSON.parse(cmdArgs[0]):true);
                break;

            case '-dry-run':
                dryRun=cmdArgs.length?JSON.parse(cmdArgs[0]):true;
                break;

            case '-config':
                for(const a of cmdArgs){
                    args=[...args,...loadConfig(a)];
                }
                break;

            case '-exit':
                if(dryRun){
                    console.info('dryRun skip -exit',{cmdArgs});
                }else{
                    exit(Number(cmdArgs[0]||0));
                }
                break;

            case '-delete-cache':
                deleteCache=cmdArgs.length?JSON.parse(cmdArgs[0]):true;
                break;

            case '-session':
                sessionName=cmdArgs[0]||'default';
                break;

            case "-hub":
                if(!clean){
                    if(dryRun){
                        console.info('dryRun skip -hub',{cmdArgs});
                    }else{
                        keepAlive=true;
                        for(const a of cmdArgs){
                            runHub(a,sessionName);
                        }
                    }
                }
                break;

            case '-target':
                targetProjects=cmdArgs;
                break;
            
            case '-use':
                if(dryRun){
                    console.info('dryRun skip -use ',{targetProjects,cmdArgs});
                }else{
                    if(clean){
                        for(const pk of cmdArgs){
                            cleanTargetProjects(pk,targetProjects.length?targetProjects:undefined);
                        }
                    }else{
                        keepAlive=true;
                        for(const p of targetProjects){
                            for(const pk of cmdArgs){
                                useTargetProject(p,pk,deleteCache,sessionName);
                            }
                        }
                    }
                }
                break;

            case '-init-metro':
                if(dryRun){
                    console.info('dryRun skip -init-metro',{cmdArgs});
                }else{
                    initMetroTemplate(cmdArgs[0]||'.');
                }
                break;

            case '-get-metro-modules':
                console.info(loadExtraNodeModules(path.join(cmdArgs[0]||'.',metroConfigFile)));
                break;

            case '-clean':
                if(cmdArgs[0]?.toLowerCase()==='all'){
                    if(dryRun){
                        console.info('dryRun skip -clean',{cmdArgs});
                    }else{
                        cleanAllTargetProjects();
                    }
                }else{
                    clean=cmdArgs.length?JSON.parse(cmdArgs[0]):true;
                }
                break;

            case '-sleep':
                if(dryRun){
                    console.info('dryRun skip -sleep',{cmdArgs});
                }else{
                    sleep(Number(cmdArgs[0])||0);
                }
                break;

            case '-print-args':
                console.info(JSON.stringify({
                    index:i,
                    length:args.length,
                    args
                },null,4))
                break;

            default:
                throw new Error(`Unknown arg [${args[i].toLowerCase()}]`)
        }
        i+=cmdArgs.length;
    }

    if(!keepAlive){
        exit(0,true);
    }
}

const pathArgNames=['-hub','-target','-config']

function normalizeArgs(args:string[],configPath:string):string[]
{
    args=[...args];
    
    const dir=path.resolve(path.dirname(configPath));

    for(let i=0;i<args.length;i++){
        if(pathArgNames.includes(args[i])){
            i++;
            for(;i<args.length;i++){
                let v=args[i];
                if(v.startsWith('-')){
                    break;
                }
                v=path.isAbsolute(v)?v:path.resolve(path.join(dir,v));
                args[i]=v;
            }
        }
    }

    return args;
}

function loadConfig(configPath:string, configValue?:ArgConfig):string[]
{
    const config=configValue ?? loadJson<ArgConfig>(configPath);
    
    const dir=path.dirname(configPath);

    let args:string[]=[];

    if(config.dryRun!==undefined){
        args.push('-dry-run');
        args.push(config.dryRun?'true':'false');
    }

    if(config.preArgs!==undefined){
        args=[...args,...normalizeArgs(config.preArgs,configPath)]
    }

    if(config.sleep!==undefined){
        args.push('-sleep');
        args.push(config.sleep.toString())
    }

    if(config.clean!==undefined){
        args.push('-clean');
        args.push(config.clean==='all'?'all':config.clean?'true':'false')
    }

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

    if(config.target!==undefined){
        args.push('-target');
        args.push(path.isAbsolute(config.target)?config.target:path.join(dir,config.target));
    }

    if(config.use!==undefined){
        args.push('-use');
        for(const u of config.use){
            args.push(u);
        }
    }

    if(config.scopes){

        for(const scope of config.scopes){

            const scopedArgs=loadConfig(configPath,scope);
            for(const a of scopedArgs){
                args.push(a);
            }

            //resets the current targets so that each scope has its own targets
            args.push('-target');
        }
    }

    if(config.args!==undefined){
        args=[...args,...normalizeArgs(config.args,configPath)]
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

    if(config.printArgs){
        args.push('-print-args');
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
