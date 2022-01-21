import * as fs from 'fs';
import path from "path";
import { dbDir, escapePackageName, lockDir, lockSync } from "./common";
import { isTargetLinked, unlinkTarget } from './hub';
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
    const cleanDb=(removePackage?:ProjectTarget,unlinkTargetPackage?:boolean)=>{
        lock(()=>{
            if(!fs.existsSync(pkDbDir)){
                return
            }
            if(removePackage){
                const idFile=path.join(pkDbDir,removePackage.id+'.json');
                if(fs.existsSync(idFile)){
                    fs.unlinkSync(idFile);
                }
            }
            const dirs=fs.readdirSync(pkDbDir);
            if(dirs.length===0){
                fs.rmdirSync(pkDbDir);
            }
            if(removePackage && unlinkTargetPackage && isTargetLinked(removePackage)){
                unlinkTarget(removePackage);
            }

        });
    }

    const clearDb=()=>{
        lock(()=>{
            if(fs.existsSync(pkDbDir)){
                fs.rmSync(pkDbDir,{recursive:true,force:true})
            }
        })
    }

    const getTargets=():ProjectTarget[]=>{
        const targets:ProjectTarget[]=[];
        lock(()=>{
            if(!fs.existsSync(pkDbDir)){
                return []
            }
            const files=fs.readdirSync(pkDbDir);
            for(const file of files){
                const filePath=path.join(pkDbDir,file);
                if(!filePath.endsWith('.json')){
                    continue;
                }
                try{
                    targets.push(JSON.parse(fs.readFileSync(filePath).toString()));
                }catch{}
            }
        });
        return targets;
    }

    return {
        escapedName,
        lockPath,
        pkDbDir,
        lock,
        createDb,
        cleanDb,
        clearDb,
        getTargets
    }
}