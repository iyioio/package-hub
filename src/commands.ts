import * as fs from 'fs';
import path from 'path';
import { dbDir, loadJson, lockDir, setVerbose, sleep, takeArgs } from './common';
import { runPackage } from './hub';
import { initMetroTemplate, loadExtraNodeModules, metroConfigFile } from './metro-template';
import { exit, processInit } from './process';
import { cleanAllTargetProjects, cleanTargetProjects, useTargetProject } from './target';
import { PackageConfig, PackageHubConfig } from './types';

export interface PackageHubRunOptions
{
    args:string[];
    exitAtEnd?:boolean;
}

export function runPackageHub(config:PackageHubConfig):number
{
    return runPackageHubWithOptions({args:configToArgs(config)})
}

export function runPackageHubWithOptions({args,exitAtEnd}:PackageHubRunOptions):number
{
    args=[...args];

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
                    args=[...args,...loadConfigFile(a)];
                }
                break;

            case "-hub":
                let insert=i+1+cmdArgs.length;
                for(const a of cmdArgs){
                    const loadedArgs=loadHubConfigFile(a);
                    for(const la of loadedArgs){
                        args.splice(insert++,0,la);
                    }
                }
                break;

            case '-exit':
                if(dryRun){
                    console.info('dryRun skip -exit',{cmdArgs});
                }else{
                    const code=Number(cmdArgs[0]||0)
                    if(exitAtEnd){
                        exit(code);
                    }
                    return code;
                }
                break;

            case '-delete-cache':
                deleteCache=cmdArgs.length?JSON.parse(cmdArgs[0]):true;
                break;

            case '-session':
                sessionName=cmdArgs[0]||'default';
                break;

            case "-package":
                if(!clean){
                    if(dryRun){
                        console.info('dryRun skip -package',{cmdArgs});
                    }else{
                        keepAlive=true;
                        for(const pkPath of cmdArgs){
                            let pkc:PackageConfig;
                            if(pkPath.startsWith('{')){
                                pkc=JSON.parse(pkPath);
                            }else{
                                pkc={path:pkPath}
                            }
                            runPackage(pkc);
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

    if(!keepAlive && exitAtEnd){
        exit(0,true);
    }

    return 0;
}

const pathArgNames=['-hub','-target','-config','-package']

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
                if(!v.startsWith('{')){
                    v=path.isAbsolute(v)?v:path.resolve(path.join(dir,v));
                    args[i]=v;
                }
            }
        }
    }

    return args;
}

export function configToArgs(config:PackageHubConfig, directory?:string):string[]
{
    return loadConfigFile(directory?path.join(directory,'_.json'):'_.json',config);
}

function pushPackageArgs(args:string[], dir:string, packages:PackageConfig[])
{
    args.push('-package');
    for(const p of packages){
        const pk={...p}
        pk.path=path.isAbsolute(p.path)?p.path:path.resolve(path.join(dir,p.path));
        args.push(JSON.stringify(pk));
    }
}

export function loadHubConfigFile(configPath:string, configValue?:PackageHubConfig):string[]
{
    if(fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()){
        configPath=path.join(configPath,'pkhub-config.json');
    }
    const config=configValue ?? loadJson<PackageHubConfig>(configPath);
    
    const dir=path.dirname(configPath);

    let args:string[]=[];

    if(config.packages!==undefined){
        pushPackageArgs(args,dir,config.packages)
    }

    return args;
}

export function loadConfigFile(configPath:string, configValue?:PackageHubConfig):string[]
{
    if(fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()){
        configPath=path.join(configPath,'pkhub-config.json');
    }

    const config=configValue ?? loadJson<PackageHubConfig>(configPath);
    
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

    if(config.packages!==undefined){
        pushPackageArgs(args,dir,config.packages)
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

            const scopedArgs=loadConfigFile(configPath,scope);
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

    if(config.include!==undefined){
        args.push("-config");
        for(const p of config.include){
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
