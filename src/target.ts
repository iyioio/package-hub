import * as fs from 'fs';
import path from "path";
import { v4 as uuid } from 'uuid';
import { backupExtension, dbDir, loadJson, unescapePackageName } from "./common";
import { getPackageInfo } from "./package-info";
import { onExit } from "./process";
import { ProjectTarget, ProjectTargetConfig } from "./types";

export function useTargetProject(projectPath:string, packageName:string, deleteCache:boolean, sessionName:string)
{
    projectPath=path.resolve(projectPath);
    const id=uuid();
    const np=path.join(projectPath,'node_modules',packageName.split('..').join('__'));
    const projectConfigPath=path.join(projectPath,'pkhub-target.json');

    let projectConfig:ProjectTargetConfig;

    if(fs.existsSync(projectConfigPath)){
        projectConfig=loadJson<ProjectTargetConfig>(projectConfigPath)
    }else{
        projectConfig={copyDist:true}
    }

    if(!projectConfig.symlink && projectConfig.copyDist===undefined){
        projectConfig.copyDist=true;
    }

    const _deleteCache=()=>{
        if(deleteCache){
            const cachePath=path.join(projectPath,'node_modules/.cache');
            if(fs.existsSync(cachePath)){
                try{
                    fs.rmSync(cachePath,{recursive:true,force:true});
                }catch(ex:any){
                    console.error('delete node_modules cached failed - '+cachePath,ex);
                }
            }
        }
    }

    _deleteCache();

    const target:ProjectTarget={
        id,
        projectPath,
        packageName,
        nodeModulePath:np,
        nodeModuleBackupPath:np+backupExtension,
        ...projectConfig,
    }

    const {createDb,cleanDb}=getPackageInfo(packageName);

    onExit(()=>{
        cleanDb(target);
        _deleteCache();
    })

    createDb(target);
}

export function cleanAllTargetProjects()
{
    const names=fs.readdirSync(dbDir).map(n=>unescapePackageName(n));
    for(const name of names){
        cleanTargetProjects(name);
    }

}

export function cleanTargetProjects(packageName:string, projectPaths?:string[])
{

    if(projectPaths){
        projectPaths=projectPaths.map(p=>path.resolve(p))
    }

    const {getTargets,cleanDb}=getPackageInfo(packageName);

    const targets=getTargets();

    for(const target of targets){
        if(!projectPaths || projectPaths.includes(target.projectPath)){
            cleanDb(target,true);
        }
    }
}