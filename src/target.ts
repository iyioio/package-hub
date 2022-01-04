import path from "path";
import { v4 as uuid } from 'uuid';
import { backupExtension } from "./common";
import { getPackageInfo } from "./package-info";
import { onExit } from "./process";
import { ProjectTarget } from "./types";
import * as fs from 'fs';

export function useTargetProject(projectPath:string, packageName:string, deleteCache:boolean, sessionName:string)
{
    projectPath=path.resolve(projectPath);
    const id=uuid();
    const np=path.join(projectPath,'node_modules',packageName.split('..').join('__'));

    const _deleteCache=()=>{
        if(deleteCache){
            const cachePath=path.join(projectPath,'node_modules/.cache');
            if(fs.existsSync(cachePath)){
                try{
                    fs.rmSync(cachePath,{recursive:true,force:true});
                }catch(ex:any){
                    console.log('delete node_modules cached failed - '+cachePath,ex);
                }
            }
        }
    }

    _deleteCache();

    const isMetro=fs.existsSync(path.join(projectPath,'metro.config.js'));

    const target:ProjectTarget={
        id,
        projectPath,
        packageName,
        nodeModulePath:np,
        nodeModuleBackupPath:np+backupExtension,
        noSymlink:isMetro,
        copyDist:isMetro
    }

    const {createDb,cleanDb}=getPackageInfo(packageName);

    onExit(()=>{
        cleanDb(target);
        _deleteCache();
    })

    createDb(target);
}