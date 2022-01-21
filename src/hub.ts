import chalk from "chalk";
import { ChildProcess } from "child_process";
import * as fs from 'fs';
import fse from 'fs-extra';
import path from "path";
import { loadJson, lockSync, saveJson, tryLoadJson } from "./common";
import { addMetroPackage, metroConfigFile, removeMetroPackage } from "./metro-template";
import { getPackageInfo } from "./package-info";
import { cmd, exit, kill, onExit } from "./process";
import { HubConfig, PackageConfig, ProjectTarget } from "./types";


export function runHub(configPath:string, sessionName:string)
{

    if(!configPath.toLowerCase().endsWith('.json')){
        configPath=path.join(configPath,'package-hub.json');
    }

    if(!fs.existsSync(configPath)){
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

    if(!fs.existsSync(pkJsonPath)){
        throw new Error(pkJsonPath+' does not exist');
    }

    console.info(chalk.blueBright('Start '+pkJsonPath))

    const pk=loadJson<any>(pkJsonPath);

    const tsConfigPath=path.join(pkDir,'tsconfig.json');
    const isTs=fs.existsSync(tsConfigPath);
    const tsConfig=isTs?loadJson<any>(tsConfigPath):null;


    let entryFile=pk?.packagehubEntry||pk?.entry;
    if(!entryFile && pk?.main){
        const parts:string[]=pk.main.split('/');
        parts.shift();
        if(parts.length && isTs){
            let n=parts[parts.length-1];
            const i=n.lastIndexOf('.');
            if(i!==-1){
                n=n.substring(0,i)+'.ts';
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
    const relativeOutDir=pkConfig.outDir||'.';
    
    let proc:ChildProcess|null=null;
    let dbWatcher:fs.FSWatcher|null=null;
    let distWatcher:fs.FSWatcher|null=null;

    const {pkDbDir,lock,createDb,cleanDb}=getPackageInfo(pkConfig.name);


    const cleanup=()=>{
        console.info(chalk.blueBright('Stop '+pkJsonPath));
        kill(proc);
        update(true);
        cleanDb();
        dbWatcher?.close();
        distWatcher?.close();
    }

    onExit(cleanup)

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
                        linkTarget(target,pkDir,distPath,relativeOutDir,entryPath);
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
                unlinkTarget(target,entryPath);
            }
        }catch(ex:any){
            console.error('update hub targets failed - '+pkConfig.name,ex);
            exit(1);
        }

    }

    dbWatcher=fs.watch(pkDbDir,null,()=>{
        setTimeout(update,100);
    });

    distWatcher=fs.watch(distPath,{recursive:true},(e,filename)=>{
        const fullName=path.join(distPath,filename);
        const exists=fs.existsSync(fullName);
        for(const target of targets){
            if(!target.copyDist){
                continue;
            }

            const dest=path.join(target.nodeModulePath,relativeOutDir,filename);
            if(exists){
                fse.copySync(fullName,dest);
            }else{
                fs.rmSync(dest,{recursive:true,force:true})
            }

        }
    })

    update();
}

function linkTarget(target:ProjectTarget, pkDir:string, distPath:string, outDir:string, entryPath:string)
{
    console.info(chalk.cyanBright(`link ${target.packageName} - ${pkDir} -> ${target.nodeModulePath}`))
    
    const packagePath=path.join(target.projectPath,'package.json');
    if(!fs.existsSync(packagePath)){
        fs.writeFileSync(packagePath,'{}');
    }

    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');

    lockSync(packagePath,()=>{
        const dir=path.join(target.projectPath,'.packagehub');
        if(!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        const isTs=fs.existsSync(tsConfig);
        if(isTs){
            const tsConfigBk=path.join(dir,'tsconfig.packagehub.json');
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
            if(!config.compilerOptions.paths[target.packageName].includes(entryPath)){
                config.compilerOptions.paths[target.packageName].push(entryPath);
            }
            saveJson(tsConfig,config,2);
        }

        const metroPath=path.join(target.projectPath,metroConfigFile);
        if(fs.existsSync(metroPath)){
            addMetroPackage(metroPath,target.packageName,distPath);
        }

        const refPath=path.join(dir,'ref-count');
        const refCount=(tryLoadJson<number>(refPath)||0)+1;
        saveJson(refPath,refCount);
    });

    if(!target.noSymlink || target.copyDist){
        if(target.nodeModuleBackupPath && !fs.existsSync(target.nodeModuleBackupPath))
        {
            if(fs.existsSync(target.nodeModulePath)){
                fs.renameSync(target.nodeModulePath,target.nodeModuleBackupPath);
            }else{
                fs.mkdirSync(target.nodeModuleBackupPath,{recursive:true})
            }
        }

        if(!target.noSymlink){
            fs.symlinkSync(path.resolve(pkDir),target.nodeModulePath);
        }

        if(target.copyDist){
            fs.mkdirSync(target.nodeModulePath);
            fs.copyFileSync(path.join(pkDir,'package.json'),path.join(target.nodeModulePath,'package.json'))
            fse.copySync(distPath,path.join(target.nodeModulePath,outDir))
        }
    }
}

export function isTargetLinked(target:ProjectTarget)
{
    const dir=path.join(target.projectPath,'.packagehub');
    return fs.existsSync(dir);
}

export function unlinkTarget(target:ProjectTarget, entryPath?:string)
{
    console.info(chalk.cyanBright(`unlink ${target.packageName} - ${target.nodeModulePath}`));

    if(!target.noSymlink || target.copyDist){
        if(!target.noSymlink){
            fs.unlinkSync(target.nodeModulePath);
        }
        if(target.copyDist){
            fs.rmSync(target.nodeModulePath,{recursive:true,force:true})
        }

        if(target.nodeModuleBackupPath && fs.existsSync(target.nodeModuleBackupPath))
        {
            if(fs.readdirSync(target.nodeModuleBackupPath).length===0){
                fs.rmdirSync(target.nodeModuleBackupPath);
            }else{
                fs.renameSync(target.nodeModuleBackupPath,target.nodeModulePath);
            }
        }
    }

    const metroPath=path.join(target.projectPath,metroConfigFile);
    if(fs.existsSync(metroPath)){
        removeMetroPackage(metroPath,target.packageName);
    }

    const tsConfig=path.join(target.projectPath,'tsconfig.packagehub.json');
    const packagePath=path.join(target.projectPath,'package.json');
    if(fs.existsSync(packagePath)){
        lockSync(packagePath,()=>{

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
                if(entryPath){
                    let config=tryLoadJson<any>(tsConfig);
                    if(typeof config !== 'object'){
                        config={}
                    }
                    const ary:string[]|undefined=config.compilerOptions?.paths?.[target.packageName];
                    if(ary){
                        while(true){
                            const i=ary.indexOf(entryPath);
                            if(i===-1){
                                break;
                            }
                            ary.splice(i,1);
                        }
                        saveJson(tsConfig,config,2);
                    }
                }

            }

        });
    }
}