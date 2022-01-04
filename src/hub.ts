import chalk from "chalk";
import path from "path";
import { backupExtension, loadJson, lockSync, saveJson, tryLoadJson } from "./common";
import { HubConfig, PackageConfig, ProjectTarget } from "./types";
import * as fs from 'fs';
import { ChildProcess } from "child_process";
import { getPackageInfo } from "./package-info";
import { cmd, onExit } from "./process";


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


    if(!pkConfig.name && pk.name){
        pkConfig.name=pk.name;
    }

    if(!pkConfig.name){
        throw new Error('Unable to determine package name - '+pkConfig.path);
    }

    if(!pkConfig.outDir && tsConfig?.compilerOptions?.outDir){
        pkConfig.outDir=tsConfig.compilerOptions.outDir;
    }

    const outDir=pkConfig.outDir?path.join(pkDir,pkConfig.outDir):null;

    if(pkConfig.watch===undefined){
        pkConfig.watch='watch';
    }
    
    let proc:ChildProcess|null=null;
    let watcher:fs.FSWatcher|null=null;

    const {pkDbDir,lock,createDb,cleanDb}=getPackageInfo(pkConfig.name);

    createDb();

    onExit(()=>{
        console.info(chalk.blueBright('Stop '+pkJsonPath));
        proc?.kill();
        update(true);
        cleanDb();
        watcher?.close();
    })

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

    const update=(exit?:boolean)=>{
        let files:string[]=[];
        lock(()=>{
            files=fs.readdirSync(pkDbDir);
        });
        const paths:string[]=[];

        if(!exit){
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
                    linkTarget(target,pkDir);
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
            unlinkTarget(target,pkDir);
        }

    }

    watcher=fs.watch(pkDbDir,null,(e)=>{
        setTimeout(update,100);
    });

    update();
}

function linkTarget(target:ProjectTarget, pkDir:string)
{
    console.info(chalk.cyanBright(`link ${target.packageName} - ${pkDir} -> ${target.nodeModulePath}`))
    
    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');
    if(fs.existsSync(tsConfig)){
        lockSync(tsConfig,()=>{
            const tsConfigBk=tsConfig+backupExtension;
            if(!fs.existsSync(tsConfigBk)){
                fs.copyFileSync(tsConfig,tsConfigBk);
            }
            let config=tryLoadJson<any>(tsConfig);
            if(typeof config !== 'object'){
                config={}
            }
            if(config.compilerOptions !== 'object'){
                config.compilerOptions={};
            }
            if(config.compilerOptions.paths !== 'object'){
                config.compilerOptions.paths={};
            }
            if(!Array.isArray(config.compilerOptions.paths[target.packageName])){
                config.compilerOptions.paths[target.packageName]=[];
            }
            config.compilerOptions.paths[target.packageName].push(pkDir);
            saveJson(tsConfig,config,2);

            const refPath=path.join(target.projectPath,'.packagehub-ref-count');
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

function unlinkTarget(target:ProjectTarget, pkDir:string)
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

    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');
    if(fs.existsSync(tsConfig)){
        lockSync(tsConfig,()=>{

            const refPath=path.join(target.projectPath,'.packagehub-ref-count');
            const refCount=(tryLoadJson<number>(refPath)||0)-1;

            if(refCount<=0){
                fs.unlinkSync(refPath);
                const tsConfigBk=tsConfig+backupExtension;
                if(fs.existsSync(tsConfigBk)){
                    fs.copyFileSync(tsConfigBk,tsConfig);
                    fs.unlinkSync(tsConfigBk)
                }
            }else{
                saveJson(refPath,refCount);
                let config=tryLoadJson<any>(tsConfig);
                if(typeof config !== 'object'){
                    config={}
                }
                const ary:string[]=config.compilerOptions?.paths?.[target.packageName];
                const i=ary?.indexOf(pkDir);
                if(i!==undefined && i!==-1){
                    ary.splice(i,1);
                    saveJson(tsConfig,config,2);
                }

            }

            
            
        });
    }
}