import { dbDir, escapePackageName, lockDir, lockSync } from "./common";
import * as fs from 'fs';
import path from "path";
import { PackageInfo, ProjectTarget } from "./types";

export function getPackageInfo(packageName:string):PackageInfo
{
    const escapedName=escapePackageName(packageName);
    const lockPath=path.join(lockDir,escapedName);
    const pkDbDir=path.join(dbDir,escapedName);
    if(!fs.existsSync(lockPath)){
        fs.writeFileSync(lockPath,'.');
    }
    const lock=(work:()=>void)=>{
        lockSync(lockPath,work);
    }
    const createDb=(addPackage?:ProjectTarget)=>{
        lock(()=>{
            fs.mkdirSync(pkDbDir,{recursive:true});
            
            if(addPackage){
                const idFile=path.join(pkDbDir,addPackage.id+'.json');
                fs.writeFileSync(idFile,JSON.stringify(addPackage));
            }
        });
    }
    const cleanDb=(removePackage?:ProjectTarget)=>{
        lock(()=>{
            if(removePackage){
                const idFile=path.join(pkDbDir,removePackage.id+'.json');
                fs.unlinkSync(idFile);
            }
            const dirs=fs.readdirSync(pkDbDir);
            if(dirs.length===0){
                fs.rmdirSync(pkDbDir);
            }
        });
    }
    return {
        escapedName,
        lockPath,
        pkDbDir,
        lock,
        createDb,
        cleanDb
    }
}