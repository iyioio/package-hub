import chalk from "chalk";
import path from "path";
import { loadJson, lockSync, saveJson, tryLoadJson } from "./common";
import { HubConfig, PackageConfig, ProjectTarget } from "./types";
import * as fs from 'fs';
import { ChildProcess } from "child_process";
import { getPackageInfo } from "./package-info";
import { exit, cmd, onExit, kill } from "./process";
import { addMetroPackage, metroConfigFile, removeMetroPackage } from "./metro-template";


export function runHub(configPath:string, sessionName:string)
{

    if(!configPath.toLowerCase().endsWith('.json')){
        configPath=path.join(configPath,'package-hub.json');
    }

    if(!fs.statSync(configPath).isFile()){
        throw new Error(configPath+' does not exist');
    }

    console.info(chalk.green('Running Package-Hub '+configPath));

    const config=loadJson<HubConfig>(configPath);

    const hubDir=path.dirname(configPath);

    for(const pkConfig of config.packages){
        runPackage(hubDir,pkConfig);
    }
}


function runPackage(hubDir:string, pkConfig:PackageConfig)
{
    pkConfig={...pkConfig}
    let pkJsonPath=path.join(hubDir,pkConfig.path);
    if(!pkJsonPath.toLowerCase().endsWith('.json')){
        pkJsonPath=path.join(pkJsonPath,'package.json');
    }

    const pkDir=path.resolve(path.dirname(pkJsonPath));

    if(!fs.statSync(pkJsonPath).isFile()){
        throw new Error(pkJsonPath+' does not exist');
    }

    console.info(chalk.blueBright('Start '+pkJsonPath))

    const pk=loadJson<any>(pkJsonPath);

    const tsConfigPath=path.join(pkDir,'tsconfig.json');
    const isTs=fs.statSync(tsConfigPath).isFile();
    const tsConfig=isTs?loadJson<any>(tsConfigPath):null;


    let entryFile=pk?.packagehubEntry||pk?.entry;
    if(!entryFile && pk?.main){
        const parts:string[]=pk.main.split('/');
        parts.shift();
        if(parts.length && isTs){
            let n=parts[parts.length-1];
            const i=n.lastIndexOf('.');
            if(i!==-1){
                n=n.substr(0,i)+'.ts';
            }
            parts[parts.length-1]=n;
        }
        entryFile=path.join(pkDir,parts.join('/'))
    }

    const entryPath=entryFile?
        path.isAbsolute(entryFile)?entryFile:path.join(pkDir,entryFile):
        pkDir;




    if(!pkConfig.name && pk.name){
        pkConfig.name=pk.name;
    }

    if(!pkConfig.name){
        throw new Error('Unable to determine package name - '+pkConfig.path);
    }

    if(!pkConfig.outDir && tsConfig?.compilerOptions?.outDir){
        pkConfig.outDir=tsConfig.compilerOptions.outDir;
    }

    if(pkConfig.watch===undefined){
        pkConfig.watch='watch';
    }

    const distPath=pkConfig.outDir?path.join(pkDir,pkConfig.outDir):pkDir;
    
    let proc:ChildProcess|null=null;
    let watcher:fs.FSWatcher|null=null;

    const {pkDbDir,lock,createDb,cleanDb}=getPackageInfo(pkConfig.name);

    onExit(()=>{
        console.info(chalk.blueBright('Stop '+pkJsonPath));
        kill(proc);
        update(true);
        cleanDb();
        watcher?.close();
    })

    createDb();

    if(pkConfig.watch!==false){
        if(pk.scripts?.[pkConfig.watch]){
            proc=cmd(pkDir,`cd "${pkDir}" && npm run ${pkConfig.watch}`)
        }else if(isTs && pkConfig.outDir){
            proc=cmd(pkDir,`cd "${pkDir}" && tsc --watch --outDir "${pkConfig.outDir}"`)
        }else{
            throw new Error('Unable to determine watch command - '+pkJsonPath);
        }
    }

    const targets:ProjectTarget[]=[];

    const update=(shouldExit?:boolean)=>{
        try{
            let files:string[]=[];
            lock(()=>{
                files=fs.readdirSync(pkDbDir);
            });
            const paths:string[]=[];

            if(!shouldExit){
                for(const file of files){
                    const filePath=path.join(pkDbDir,file);
                    let target:ProjectTarget;
                    try{
                        target=loadJson<ProjectTarget>(filePath);
                    }catch(ex:any){
                        console.error('Invalid target file - ',filePath);
                        continue;
                    }
                    
                    paths.push(target.projectPath);
                    if(!targets.find(t=>t.projectPath===target.projectPath)){
                        targets.push(target);
                        linkTarget(target,pkDir,distPath,entryPath);
                    }
                }
            }

            for(let i=0;i<targets.length;i++){
                const target=targets[i];
                if(paths.includes(target.projectPath)){
                    continue;
                }
                targets.splice(i,1);
                i--;
                unlinkTarget(target,pkDir,entryPath);
            }
        }catch(ex:any){
            console.error('update hub targets failed - '+pkConfig.name,ex);
            exit(1);
        }

    }

    watcher=fs.watch(pkDbDir,null,(e)=>{
        setTimeout(update,100);
    });

    update();
}

function linkTarget(target:ProjectTarget, pkDir:string, distPath:string, entryPath:string)
{
    console.info(chalk.cyanBright(`link ${target.packageName} - ${pkDir} -> ${target.nodeModulePath}`))
    
    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');
    if(fs.existsSync(tsConfig)){
        lockSync(tsConfig,()=>{
            const dir=path.join(target.projectPath,'.packagehub');
            const tsConfigBk=path.join(dir,'tsconfig.packagehub.json');
            if(!fs.existsSync(dir)){
                fs.mkdirSync(dir);
            }
            if(!fs.existsSync(tsConfigBk)){
                fs.copyFileSync(tsConfig,tsConfigBk);
            }
            let config=tryLoadJson<any>(tsConfig);
            if(typeof config !== 'object'){
                config={}
            }
            if(typeof config.compilerOptions !== 'object'){
                config.compilerOptions={};
            }
            if(typeof config.compilerOptions.paths !== 'object'){
                config.compilerOptions.paths={};
            }
            if(!Array.isArray(config.compilerOptions.paths[target.packageName])){
                config.compilerOptions.paths[target.packageName]=[];
            }
            config.compilerOptions.paths[target.packageName].push(entryPath);
            saveJson(tsConfig,config,2);

            const metroPath=path.join(target.projectPath,metroConfigFile);
            if(fs.existsSync(metroPath)){
                addMetroPackage(metroPath,target.packageName,distPath);
            }

            const refPath=path.join(dir,'ref-count');
            const refCount=(tryLoadJson<number>(refPath)||0)+1;
            saveJson(refPath,refCount);
        });
    }

    if(target.nodeModuleBackupPath && !fs.existsSync(target.nodeModuleBackupPath))
    {
        if(fs.existsSync(target.nodeModulePath)){
            fs.renameSync(target.nodeModulePath,target.nodeModuleBackupPath);
        }else{
            fs.mkdirSync(target.nodeModuleBackupPath,{recursive:true})
        }
    }

    fs.symlinkSync(path.resolve(pkDir),target.nodeModulePath);
}

function unlinkTarget(target:ProjectTarget, pkDir:string, entryPath:string)
{
    console.info(chalk.cyanBright(`unlink ${target.packageName} - ${target.nodeModulePath}`));

    fs.unlinkSync(target.nodeModulePath);

    if(target.nodeModuleBackupPath && fs.existsSync(target.nodeModuleBackupPath))
    {
        if(fs.readdirSync(target.nodeModuleBackupPath).length===0){
            fs.rmdirSync(target.nodeModuleBackupPath);
        }else{
            fs.renameSync(target.nodeModuleBackupPath,target.nodeModulePath);
        }
    }

    const metroPath=path.join(target.projectPath,metroConfigFile);
    if(fs.existsSync(metroPath)){
        removeMetroPackage(metroPath,target.packageName);
    }

    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');
    if(fs.existsSync(tsConfig)){
        lockSync(tsConfig,()=>{

            const dir=path.join(target.projectPath,'.packagehub');

            const refPath=path.join(dir,'ref-count');
            const refCount=(tryLoadJson<number>(refPath)||0)-1;

            if(refCount<=0){
                const tsConfigBk=path.join(dir,'tsconfig.packagehub.json');
                if(fs.existsSync(tsConfigBk)){
                    fs.copyFileSync(tsConfigBk,tsConfig);
                }
                fs.rmSync(dir,{recursive:true,force:true})
            }else{
                saveJson(refPath,refCount);
                let config=tryLoadJson<any>(tsConfig);
                if(typeof config !== 'object'){
                    config={}
                }
                const ary:string[]=config.compilerOptions?.paths?.[target.packageName];
                const i=ary?.indexOf(entryPath);
                if(i!==undefined && i!==-1){
                    ary.splice(i,1);
                    saveJson(tsConfig,config,2);
                }

            }

        });
    }
}